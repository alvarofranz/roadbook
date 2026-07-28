import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Social sign-in wiring — Google (#46) + Apple (#370). The flow itself needs a device (an OS
   sheet, a provider popup), but every contract it spans CAN be checked here, and each one breaks
   sign-in silently when it drifts: the account page's boxes are found by id, each provider posts to
   an API action that must exist, the app calls a bridge method named after the provider, the CSP
   has to whitelist the provider's script host, and iOS needs the capability in its entitlements.
   Apple missing on iOS is what got the app rejected under App Store guideline 4.8, so it is
   guarded here rather than discovered in review. */

const LANGS = ['es', 'it', 'de', 'fr'];
const read = (p) => fs.readFileSync(p, 'utf8');

const accountJs = read('public/account/account.js');
const accountHtml = read('public/account/index.html');
const nativeJs = read('native/src/native.js');
const apiRouter = read('public/api/index.php');
const authPhp = read('app/auth.php');
const htaccess = read('public/.htaccess');

// The provider catalog the account page drives everything from: { key → API action }.
function providers() {
    const block = accountJs.match(/const PROVIDERS = \{([\s\S]*?)\n {4}\};/);
    expect(block).toBeTruthy();
    const found = {};
    const re = /(\w+): \{ action: '(\w+)'/g;
    let m;
    while ((m = re.exec(block[1]))) found[m[1]] = m[2];
    return found;
}

describe('social sign-in providers', () => {
    const PROVIDERS = providers();

    it('offers Google AND Apple (guideline 4.8 needs both)', () => {
        expect(Object.keys(PROVIDERS).sort()).toEqual(['apple', 'google']);
    });

    for (const [key, action] of Object.entries(providers())) {
        it(`${key}: the page has the #${key}Btn box the script renders into`, () => {
            expect(accountHtml).toContain(`id="${key}Btn"`);
        });

        it(`${key}: the API router handles '${action}' and auth.php implements it`, () => {
            expect(apiRouter).toContain(`case '${action}':`);
            expect(authPhp).toContain(`function ${action}(array $d): void`);
        });

        it(`${key}: the native bridge exposes ${key}SignIn for the app path`, () => {
            expect(nativeJs).toContain(`async ${key}SignIn()`);
        });
    }

    it('the wrapper the script shows/hides exists on the page', () => {
        expect(accountJs).toContain("$('socialSignin')");
        expect(accountHtml).toContain('id="socialSignin"');
    });

    it('Apple is offered on iOS and on the configured web, never in the Android app', () => {
        expect(accountJs).toContain("apple: IS_APP ? RBPlatform() === 'ios' : !!appleClientId");
    });

    // The plugin checks its apple block FIRST and rejects the whole initialize() when the Android
    // web-flow settings are missing — so passing `apple` there would never reach the google block
    // and would break Google sign-in in the Android app.
    it('the bridge only configures Apple on iOS, so Android keeps Google working', () => {
        expect(nativeJs).toContain("if (Capacitor.getPlatform() === 'ios') config.apple = { redirectUrl: '' };");
        expect(nativeJs).not.toMatch(/initialize\(\{[\s\S]*apple:/);
    });
});

describe('Sign in with Apple plumbing', () => {
    it('both surfaces are accepted token audiences, each configurable on its own', () => {
        const bootstrap = read('app/bootstrap.php');
        expect(bootstrap).toContain("'apple_service_id'");
        expect(bootstrap).toContain('APPLE_SERVICE_ID');
        expect(bootstrap).toContain('APPLE_APP_ID');
        expect(read('.env.example')).toMatch(/APPLE_SERVICE_ID=\nAPPLE_APP_ID=/);
    });

    it('the web Services ID reaches the client through the config call', () => {
        expect(apiRouter).toContain("'apple_client' => $CFG['apple_service_id']");
        expect(accountJs).toContain('cfg.apple_client');
    });

    it('the identity token is verified against Apple, not trusted as sent', () => {
        expect(authPhp).toContain('jwt_claims_rs256');
        expect(authPhp).toContain('https://appleid.apple.com/auth/keys');
        expect(authPhp).toContain("if ((string)($c['iss'] ?? '') !== 'https://appleid.apple.com')");
        expect(authPhp).toContain("in_array((string)($c['aud'] ?? ''), $CFG['apple_client_ids'], true)");
        expect(authPhp).toContain("if ((int)($c['exp'] ?? 0) <= time())");
        expect(authPhp).toContain("if (($header['alg'] ?? '') !== 'RS256') return null;"); // never trust the header's own alg
    });

    it('the schema migration adds apple_sub before any code reads it', () => {
        const sql = read('migrations/035_apple_auth.sql');
        expect(sql).toContain('ADD COLUMN apple_sub');
        expect(sql).toContain('uq_apple_sub');
        expect(authPhp).toContain("'apple' => 'apple_sub'");
    });

    it("the CSP whitelists Apple's sign-in hosts", () => {
        const csp = htaccess.match(/Content-Security-Policy "([^"]+)"/)[1];
        const directive = (name) => csp.match(new RegExp(name + ' ([^;]+)'))[1];
        expect(directive('script-src')).toContain('https://appleid.cdn-apple.com');
        expect(directive('connect-src')).toContain('https://appleid.apple.com');
        expect(directive('frame-src')).toContain('https://appleid.apple.com');
    });

    it('the iOS app declares the Sign in with Apple capability', () => {
        expect(read('ios/App/App/App.entitlements')).toContain('com.apple.developer.applesignin');
    });

    it('the buttons and the failure notice are translated in every language', () => {
        delete window.RBi18nLangs;
        for (const lang of LANGS) eval(read(`public/assets/js/i18n.${lang}.js`));
        for (const lang of LANGS) {
            expect(window.RBi18nLangs[lang]['Continue with Apple'], lang).toBeTruthy();
            expect(window.RBi18nLangs[lang]['Apple sign-in failed. Please try again.'], lang).toBeTruthy();
            // the profile hint covers both providers now that an account can come from either
            expect(window.RBi18nLangs[lang]['You signed up with Google or Apple — set a password to also sign in with email and password.'], lang).toBeTruthy();
        }
    });
});
