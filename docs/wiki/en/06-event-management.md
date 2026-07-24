# Event management

**Events** let you organise rallies, meet-ups and competitions around roadbooks on RDBK.app. An event brings together roadbooks, participants and (optionally) scoring — all under one roof.

> To create events you need the **organiser role**. See [Getting started →](01-getting-started.md) or ask an admin.

---

## 1 Event preparation

---

## 1.1 Organiser role — Prerequisites

Creating events is restricted to users with **organizer** role.

| Step | What happens |
|------|-------------|
| **Request** | From the [events feature page](/features/events/) click *Request organiser role* and briefly present the event proposal — the app emails the admin. |
| **Grant** | An admin enables the flag in the Admin panel. |
| **You're in** | *Event management* appears in your account menu. |

---

## 1.2 Create an event

Login and go to **Menu / Event management**; then click on *New event*.  

| Field | Notes |
|-------|-------|
| **Title** | Public name of the event. |
| **Description** | Describe the event; this text will be visible on the event page. |
| **Start / End** | The event window (calendar picker). |
| **Visibility** | **Public** — listed on `/events/`, anyone can find it.<br>**Private** — accessible only by direct link `/event/<slug>`. |
| **Organiser website** | Optional link displayed on the event page. |
| **Event headquarters** | Drop a pin on the map — shown on the event page. |
| **Logo** | Uploaded, auto-cropped to AVIF at 512 px. |

Once saved, the event gets its own page at `/event/<slug>` and you are its **owner**.

---

Now complete the event!

---

## 1.3 Roles & permissions for event

To manage an event the organizer can engage other subscribers as co-organizers. As a team they can share roadbooks and manage the participants subscriptions so to allow them the digital use of the roadbooks through RDBK.app platform.

Of course this is optional as you can always export roadbooks in PDF and distribute printed copies.

| Role | How you get it | What you can do |
|------|---------------|-----------------|
| **Owner** | Created the event | Everything — edit, delete, manage co-organisers, change visibility |
| **Co-organiser** | Invited by the owner | Edit parameters, attach roadbooks, manage participants. Cannot delete or change visibility |
| **Participant (active)** | Joined with a code + activated | Read ready/public roadbooks, view ranking |
| **Participant (pending)** | Entered join code, not yet activated | Limited view until activated |

### 1.3.1 Add co-organisers

In the event editor → **Organisers** section → search by username, name, email or organisation → add.  
Only the **owner** can add or remove co-organisers.

---

## 1.4 Attach roadbooks

In the event editor → **Roadbooks** section → *Add roadbook* → picker shows only **your** roadbooks.

Each roadbook gets a **scoring mode**:

| Mode | Usage |
|------|-------|
| **Free** (default) | No scoring — participants follow the route. |
| **Roadbook-suite rules** | Ranking / competition — the Reader scores the run. |
| **FIA rules** | Shown but not yet implemented. |

Roadbooks can be reordered (drag handles) and removed. Only roadbooks you own can be attached.

---

## 1.5 Manage participants joins

### 1.5.1 Generate a join code

In the event editor → **Participants** → *Generate code*.  
A 4–16 character code is created. You can customise it. A short link `/go/<code>` and a QR code are automatically available.

### 1.5.2 Share the code to join the event

Send the code (or the link / QR) to your participants. The participant will need this code to perform its registration to the event (see point **2.1.1**).

The people receiving this code will be able to preregister to the event, but will need to be activated in order to see and use the roadbooks (see **2.1.1**).

## 2 Event execution

---

## 2.1 Join + activate

Every participant must first join the event, then be **activated** by the organiser. Activation ensures the organiser personally confirms each person — no automatic self-enrolment.

---

### 2.1.1 How a participant joins

There are two ways:

| Method | How it works |
|--------|-------------|
| **Via the event page** | The participant visits `/event/<slug>`, types the join code in the form and clicks *Join*. |
| **Via the short link** `/go/<code>` | The organiser prints the event link and its QR code and places it at the entrance of the event registration desk. Participants scan the QR code, access the site, and perform their own subscription to the platform. This way they are ready for the activation step, which will be done upon finalisation of the registration formalities (e.g. requirement checks and payments). |

In both cases the server generates a unique **6-character activation code** (e.g. `X3K9M2`) and records the participant with status `pending`.

> The `/go/` link also activates **participant mode**: the navigation is restricted to event-related tools only (Recorder, Editor, etc. are hidden) and the home page redirects to the event. This keeps the experience focused for rally attendees.

---

### 2.1.2 What the participant sees after joining

Once pending, the participant sees an activation screen with:

- A **QR code** containing the 6-character activation code
- The code itself displayed as text (e.g. `X3K9M2`)
- A *Copy* button
- The instruction: *"Show this QR to the event organizer to activate your participation."*

The participant shows this QR (or reads the code aloud) to the organiser **in person** at check-in.

---

### 2.1.3 How the organiser activates each participant

On the **Participants** page (`/admin/events/participants/?id=<id>`) the organiser sees a list of pending participants. The list **auto-refreshes every 10 seconds** so new join requests appear live.

There are three ways to activate:

| Method | How |
|--------|-----|
| **1. Click *Activate*** | Next to each pending participant's name, click the *Activate* button. Instant — no code needed. |
| **2. Type the activation code** | At the top of the page, type the 6-character code (e.g. `X3K9M2`) in the input field and press Enter. |
| **3. Scan the QR code** | Click *Scan QR* to open the device camera. The rear camera scans the participant's QR and the code is auto-filled and submitted. Requires Chromium-based browser. |

The organiser can also **add participants directly** — search by username or email and add them with status `active` in one step, skipping the pending/activation flow entirely.

---

### 2.1.4 After activation

Once the status changes from `pending` to **`active`**, the participant:

- Sees *"You are participating in this event"* on the event page
- Can read all roadbooks in **ready** or **public** status
- Can use the Roadbook Reader in **Trip** or **Competition** mode

If the participant joined via `/go/<code>`, their navigation stays in **participant mode** until they switch back via *"Switch to full mode"* in the account menu.

---

## 2.2 Run the event

Participants open roadbooks in the **Reader** (`/reader/<slug>`):

| Mode | Behaviour |
|------|-----------|
| **Trip** | Follow the route — no scoring, no result. |
| **Competition** | Follow and get scored. At the finish, a signed **result QR** is produced. The result QR contains the run data signed with the participant's account token. The organiser collects these QR codes (screenshot / photo) for ranking. |

---

## 2.3 Ranking

1. Open the **Ranking** tool (`/ranking/`) for a specific competition roadbook.
2. Load the result QRs collected from participants.
3. The final classification is built automatically.

Ranking links appear on the event page for active participants and organisers.

---

## 2.4 Manage participants

From **Event management** → *Participants* for your event:

| Action | How |
|--------|-----|
| **List / search** | Paginated table with search. Pending participants are highlighted. Auto-refresh every 10 s. |
| **Activate** | Scan the participant's QR, type their activation code, or click *Activate*. |
| **Deactivate** | Click *Remove* — the participant loses access. |
| **Add directly** | Search users and add them without a join code. |
| **Export** | CSV download of the participant list. |

---

## 2.5 Event page (`/event/<slug>`)

The public event page shows:

- Logo, title and description
- Date range
- Organiser website link
- Event headquarters on a map
- Gallery of attached roadbooks (with status badges)
- Join form (for participants)
- Ranking links (once results are available)

---

## 2.6 Limits & notes

- Only roadbooks **you own** can be attached to your event (admins can attach any).
- Deleting an event is permanent — all participant associations are removed.
- The FIA scoring mode is a placeholder; use *Roadbook-suite rules* for competition.
- Join codes are case-sensitive.

---

## 2.7 Next step

Want to see what events look like from a participant's view? → [Navigate with the Reader →](04-reader.md)  
Need a GPS on-board computer? → [Tripmaster →](05-tripmaster.md)  
Want to record a new track? → [Recorder →](02-recorder.md)
