# PRD: Job Application Command Center

**Version:** 1.0 · **Status:** Ready for build · **Last updated:** 2026-09-16

## 1. Overview

Job Application Command Center is a personal job-search tracker for one job seeker (the owner). It records applications, the companies, contacts and interview stages behind them, and automatically flags applications that have gone quiet. It emails a weekly digest of what needs follow-up and checks a job description against the owner's resume. It is also a portfolio piece, so a hiring manager must be able to sign in to a demo account and see it working.

**Value proposition:** For an active job seeker, Job Application Command Center tells them which applications to chase and how well they fit a posting, without their having to remember to check. A spreadsheet or a generic tracker only stores what the job seeker types in.

## 2. Problem

During an active search the owner has many applications open at once, each with different contacts, interview rounds and dates. In a spreadsheet, nothing tells them when an application has gone silent or what is coming up this week, so follow-ups are missed unless they remember to look. Judging whether a posting fits their resume is also a manual read-through every time. Existing trackers (Huntr, Teal) cover part of this, but the owner wants automatic follow-up signals delivered to them, a fit check, and full ownership of the data.

## 3. Target Users

### Primary user (MVP)

**The owner:** a software engineer actively applying for backend and fullstack roles. They are technically fluent and use the app daily on desktop and occasionally on a phone. They want to log each application quickly, see at a glance what needs follow-up, and get a Monday email summarising the week.

### Secondary users

**Portfolio reviewer:** a hiring manager or engineer evaluating the owner's work. They open the live URL, sign in with demo credentials published in the README, and explore sample data. They spend a few minutes at most and will not read documentation first.

## 4. Goals and Success Criteria

| ID   | Goal                          | Measurable signal                                                                                                                                                                |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | The product is live           | The app and its API are reachable at public URLs listed in the README                                                                                                            |
| G-02 | The product is useful daily   | The owner records every real application in the app for 2 consecutive weeks after launch                                                                                         |
| G-03 | The automation works for real | The owner receives the weekly digest email on 2 consecutive Mondays, with correct content                                                                                        |
| G-04 | Reviewers can see it working  | A reviewer can sign in with the README demo credentials and see seeded sample data in every section: applications, companies, contacts, stages, Needs follow-up and a comparison |
| G-05 | The engineering is verifiable | The automated test suite passes, and every MVP acceptance criterion is covered by at least one test                                                                              |

## 5. Scope

### In scope (MVP)

- F-01: Sign-in and accounts (owner and demo)
- F-02: Applications and companies
- F-03: Contacts and interview stages
- F-04: Quiet-application detection and Needs follow-up list
- F-05: Weekly digest email
- F-06: Resume and job-description comparison

### Non-goals (explicitly out of MVP)

- No public sign-up. Exactly two accounts exist: the owner account and the demo account.
- No "forgot password" flow, and no password-change screen. Passwords are reset manually by the owner (see FF-06).
- No per-application reminder emails. Quiet applications appear only in the Needs follow-up list and the digest (see FF-04).
- No custom statuses. The status list is fixed (see FF-01).
- No PDF or file upload of any kind. The resume is pasted as text (see FF-02).
- No AI or LLM calls anywhere in the product (see FF-03).
- No Gmail or other inbox integration (see FF-05).
- No teams, sharing, roles or multi-tenant features. No data is visible across accounts.
- No emails other than the weekly digest.
- No analytics dashboards or charts.
- No import or export such as CSV import.
- No automatic reset of demo data.

## 6. Core User Flow

1. The owner opens the app and signs in with email and password (F-01).
2. On first use, the owner sets their quiet threshold and time zone in Settings, then pastes their resume (F-04, F-05, F-06).
3. The owner adds an application. They pick an existing company or create one inline, fill in the role and details, set the status, and paste the job description (F-02).
4. From the application, the owner runs a comparison and sees which requirements their resume matches and which are missing, plus a match percentage (F-06).
5. As the process moves, the owner adds contacts and interview stages, updates the status, and records outcomes (F-02, F-03).
6. Each day, the system checks for quiet applications. Any it finds appear in the Needs follow-up list on the home screen (F-04).
7. Every Monday at 08:00 in the owner's time zone, the owner receives a digest email. It lists quiet applications and interview stages scheduled in the next 7 days (F-05).
8. The owner follows up and updates the application, which clears it from Needs follow-up (F-04).

Reviewer flow: open the URL → sign in with the demo credentials → browse the seeded data → open a comparison → preview the digest (F-01, F-05).

## 7. Features (MVP)

### F-01: Sign-in and accounts

**Priority:** Must
**Description:** Email-and-password sign-in with long-lived sessions. There are exactly two accounts, and each account's data is private to it.
**User stories:**

- US-01: As the owner, I want to sign in securely so that my job-search data is private.
- US-02: As a portfolio reviewer, I want to sign in with published demo credentials so that I can try the app immediately.

**Behavior & rules:**

- Two accounts are created by setup or seed, not through the UI: the owner account and the demo account.
- A session lasts 7 days from sign-in. After 7 days the user must sign in again.
- Sign out ends the session immediately. Any later request using that session is rejected.
- After 5 failed sign-in attempts within 15 minutes, the account is locked for 15 minutes, counted from the 5th failure.
- The demo account is seeded with sample data covering every section: at least 8 applications spread across all 6 statuses, at least 4 companies, contacts, interview stages (including one in the next 7 days), at least 2 quiet applications, and at least 1 saved comparison.
- Every page and every API endpoint except sign-in requires a valid session.
- Each account can see and change only its own data.

**States & edge cases:**

- Wrong email or wrong password shows the same generic message ("Email or password is incorrect"), which does not reveal which one was wrong.
- A locked account shows "Too many attempts. Try again in 15 minutes." This message appears even if the correct password is entered.
- An expired or invalid session redirects the user to sign-in. The API responds with 401.
- A request for another account's record behaves as if the record does not exist (404).
- Empty email or password fields show a validation message, and no sign-in attempt is counted.

**Acceptance criteria:**

- [ ] AC-01.1: Given valid owner credentials, when the owner signs in, then they reach the home screen.
- [ ] AC-01.2: Given a wrong password, when sign-in is submitted, then the generic error is shown and no session is created.
- [ ] AC-01.3: Given 5 failed attempts within 15 minutes, when the correct password is then submitted, then sign-in is refused with the lockout message. 15 minutes later, the correct password succeeds.
- [ ] AC-01.4: Given a signed-in user, when they sign out, then reusing the previous session returns 401.
- [ ] AC-01.5: Given a session older than 7 days, when it is used, then the request returns 401.
- [ ] AC-01.6: Given no session, when any endpoint other than sign-in is called, then it returns 401.
- [ ] AC-01.7: Given the demo account, when it requests an application ID belonging to the owner, then it receives 404.
- [ ] AC-01.8: Given a fresh deployment with seed data, when the demo account signs in, then every section contains the sample data listed above.
- [ ] AC-01.9: There is no sign-up page or endpoint.

### F-02: Applications and companies

**Priority:** Must
**Description:** Create, view, edit and delete applications, each tied to a company.
**User stories:**

- US-03: As the owner, I want to log an application in under a minute so that tracking doesn't slow down applying.
- US-04: As the owner, I want to see all my applications filtered by status so that I know where each one stands.

**Behavior & rules:**

- Application fields, with required ones marked \*:
  - company\*
  - role title\*
  - status\* (default: Applied)
  - posting URL
  - location
  - work arrangement (On-site, Hybrid or Remote)
  - salary minimum and maximum (whole numbers) with a currency code
  - source (free text, e.g. "LinkedIn" or "Referral")
  - date applied
  - notes
  - job description text
- Status is one of **Wishlist, Applied, Interviewing, Offer, Rejected, Withdrawn**.
- Company fields: name\*, website, notes.
- Company names are unique per account, ignoring case and surrounding whitespace.
- A company can be created inline while creating an application.
- The application list shows company, role, status, date applied and last activity.
- The list can be filtered by status and sorted by date applied or last activity. The default sort is most recent last activity first.
- The company view lists that company's applications and contacts.
- Deleting an application also deletes its interview stages and saved comparison. Deletion requires a confirmation step.
- Deleting a company is refused while it has any applications. A company with no applications can be deleted after confirmation, which also deletes its contacts.

**States & edge cases:**

- With no applications, the list shows an empty state with an "Add your first application" action.
- A missing company or role title is rejected with a field-level message.
- A salary minimum greater than the maximum is rejected. A salary without a currency code is rejected.
- A posting URL that is not a valid http(s) URL is rejected.
- A date applied in the future is rejected.
- Creating a company with a name that already exists (case-insensitive) is rejected, and the existing company is offered instead.
- If an application with the same company and role title (case-insensitive) already exists, the user sees a warning and can still save.
- Deleting a company that has applications shows "Delete or move this company's applications first."

**Acceptance criteria:**

- [ ] AC-02.1: Given only company and role title are provided, when the application is saved, then it is created with status Applied.
- [ ] AC-02.2: Given a missing role title, when saving, then the save is rejected with a message on that field.
- [ ] AC-02.3: Given salary minimum 100 and maximum 50, when saving, then the save is rejected.
- [ ] AC-02.4: Given a company "Acme" exists, when creating company " acme ", then creation is rejected and "Acme" is offered.
- [ ] AC-02.5: Given an application "Acme / Backend Engineer" exists, when creating another with the same company and role title, then a duplicate warning is shown. Confirming saves it.
- [ ] AC-02.6: Given a company with one application, when deleting the company, then deletion is refused.
- [ ] AC-02.7: Given an application with stages and a comparison, when it is deleted, then its stages and comparison no longer exist.
- [ ] AC-02.8: Given applications in several statuses, when filtering by Interviewing, then only Interviewing applications are listed.
- [ ] AC-02.9: Given no applications, when opening the list, then the empty state is shown.
- [ ] AC-02.10: Setting a status outside the six allowed values is rejected.

### F-03: Contacts and interview stages

**Priority:** Must
**Description:** Record the people at each company and the interview rounds of each application.
**User stories:**

- US-05: As the owner, I want to store recruiter and interviewer details so that I can follow up with the right person.
- US-06: As the owner, I want to track each interview round and its outcome so that I know where I am in each process.

**Behavior & rules:**

- Contact fields, with required ones marked _: name_, title, email, LinkedIn URL, notes.
- A contact belongs to exactly one company.
- A contact can be linked to any number of applications at that same company, and an application can have any number of contacts.
- Interview stage fields, with required ones marked _: name_ (free text, e.g. "Phone screen"), scheduled date and time (optional), outcome\* (Pending, Passed or Failed; default Pending), notes.
- A stage belongs to exactly one application.
- Stages are shown in a user-controlled order. New stages go to the end, and the user can move a stage up or down.
- Scheduled times are entered and displayed in the account's time zone (see F-05).
- Deleting a contact removes its links to applications. Deleting a stage removes only that stage.

**States & edge cases:**

- An application with no stages shows "No interview stages yet." An application with no contacts shows "No contacts linked."
- A contact email that isn't a valid email address, or a LinkedIn URL that isn't a valid URL, is rejected.
- Linking a contact to an application at a different company is rejected.
- Linking the same contact to the same application twice has no effect and does not create a duplicate.
- A stage with a missing name is rejected.

**Acceptance criteria:**

- [ ] AC-03.1: Given a company, when a contact with only a name is created, then it appears on the company view.
- [ ] AC-03.2: Given a contact at company A, when linking it to an application at company B, then the link is rejected.
- [ ] AC-03.3: Given a contact already linked to an application, when linking again, then the application still shows the contact once.
- [ ] AC-03.4: Given an application with 3 stages, when stage 3 is moved up, then the order shown is 1, 3, 2.
- [ ] AC-03.5: Given a new stage with no outcome specified, when saved, then its outcome is Pending.
- [ ] AC-03.6: Given a contact linked to two applications, when the contact is deleted, then both applications no longer list it and both applications still exist.
- [ ] AC-03.7: Given an invalid contact email, when saving, then the save is rejected with a field message.

### F-04: Quiet-application detection and Needs follow-up list

**Priority:** Must
**Description:** A real scheduled job runs daily and flags active applications with no recent activity. Flagged applications appear in a Needs follow-up list.
**User stories:**

- US-07: As the owner, I want the app to tell me which applications have gone silent so that I follow up before they go cold.

**Behavior & rules:**

- **Last activity** of an application is the latest of these moments:
  - the application was created
  - any application field was edited, including status
  - any of its interview stages was added, edited, reordered or deleted
- Contact edits and comparisons do not count as activity.
- An application is **quiet** when all of these are true:
  - its status is Wishlist, Applied or Interviewing
  - it has had no activity for at least the account's quiet threshold, measured in whole days
- **Quiet threshold** is a per-account setting: an integer from 1 to 90, default 7, editable in Settings.
- The check runs automatically once per day as a scheduled job. It is not computed only when a page is opened.
- The Needs follow-up list reflects the most recent run.
- The Needs follow-up list is on the home screen. For each quiet application it shows company, role, status and days since last activity, oldest first. Each entry links to the application.
- When a quiet application has new activity, it leaves the list immediately, without waiting for the next run.
- An application moved to Offer, Rejected or Withdrawn leaves the list immediately.
- If a daily run fails, the previous flags remain, and the failure is recorded with its time. Settings shows the time and result of the last run.
- Running the check twice on the same day produces the same result: no duplicate flags.

**States & edge cases:**

- With no quiet applications, the list shows "Nothing needs follow-up."
- A threshold outside 1–90, or one that isn't a whole number, is rejected.
- A threshold change takes effect at the next daily run. Settings says so.
- If the scheduled job has never run, the list shows "First check pending."

**Acceptance criteria:**

- [ ] AC-04.1: Given threshold 7 and an Applied application with last activity 7 days ago, when the daily check runs, then the application is in Needs follow-up.
- [ ] AC-04.2: Given threshold 7 and last activity 6 days ago, when the check runs, then it is not flagged.
- [ ] AC-04.3: Given a Rejected application with last activity 30 days ago, when the check runs, then it is not flagged.
- [ ] AC-04.4: Given a flagged application, when a new interview stage is added to it, then it leaves Needs follow-up immediately.
- [ ] AC-04.5: Given a flagged application, when a linked contact is edited, then it stays flagged.
- [ ] AC-04.6: Given the check runs twice in one day, then each quiet application appears exactly once.
- [ ] AC-04.7: Given the check fails, then the previous flags are unchanged and Settings shows the failed run and its time.
- [ ] AC-04.8: The check is triggered by a scheduler without any user action. This is demonstrated by a flag appearing on the deployed app with no one signed in.
- [ ] AC-04.9: A threshold of 0 or 91 is rejected.

### F-05: Weekly digest email

**Priority:** Must
**Description:** Every Monday, the owner receives an email listing what needs attention. Outbound email is rate-limited.
**User stories:**

- US-08: As the owner, I want a Monday email of what to chase and what's coming up so that I can plan my week without opening the app.
- US-09: As a reviewer, I want to preview the digest in the demo account so that I can see the feature without receiving email.

**Behavior & rules:**

- The digest is sent every Monday at 08:00 in the account's time zone.
- **Time zone** is a per-account setting chosen from the standard IANA list, default UTC.
- The digest goes to the account's sign-in email address.
- The digest contains two sections:
  - (a) quiet applications as of the latest daily check, each with company, role and days since last activity
  - (b) interview stages scheduled from Monday 08:00 through the following 7 days, each with company, role, stage name and date and time
- Each item links to the app.
- If both sections are empty, no email is sent. The run is recorded as "Skipped: nothing to report."
- The **demo account never sends email.** Its scheduled digest run is recorded as "Skipped: demo account."
- Both accounts have a "Preview digest" action in Settings. It shows exactly what would be sent now, including the empty case.
- **Rate limit:** the whole system sends at most 5 emails per calendar day (UTC). A send that would exceed the limit is not attempted and is recorded as "Not sent: daily email limit reached." It is not retried automatically.
- A digest is sent at most once per account per Monday, even if the job runs more than once.
- Settings shows the result and time of the last digest run: Sent, Skipped (with reason), Not sent (limit), or Failed (with error summary).
- A send failure is not retried automatically.

**States & edge cases:**

- If the email provider rejects the send or is unreachable, the run is recorded as Failed. The app keeps working.
- If the time zone changes mid-week, the next Monday's send uses the new time zone.
- If the job runs late (for example because the server was asleep), the digest is still sent that Monday as soon as the job runs, as long as none was sent yet that Monday.

**Acceptance criteria:**

- [ ] AC-05.1: Given 2 quiet applications and 1 stage scheduled in the next 7 days, when the Monday job runs, then one email is sent containing all 3 items with links.
- [ ] AC-05.2: Given nothing quiet and nothing scheduled, when the job runs, then no email is sent and the run shows "Skipped: nothing to report".
- [ ] AC-05.3: Given the demo account with data, when the job runs, then no email is sent for it and the run shows "Skipped: demo account".
- [ ] AC-05.4: Given the job runs twice on the same Monday, then only one digest is sent.
- [ ] AC-05.5: Given 5 emails already sent today (UTC), when another send is due, then it is not sent and is recorded as limited.
- [ ] AC-05.6: Given a provider error, when sending, then the run is recorded as Failed and no exception reaches the user.
- [ ] AC-05.7: Given time zone Asia/Tokyo, when determining send time, then the digest is due at Monday 08:00 Tokyo time.
- [ ] AC-05.8: Given any account, when "Preview digest" is opened, then it shows the same content a send would contain at that moment.
- [ ] AC-05.9: Given a stage scheduled 8 days after Monday 08:00, then it is not included in that week's digest.

### F-06: Resume and job-description comparison

**Priority:** Must (first candidate to move to Future Features if time runs short; see R-01)
**Description:** The owner pastes their resume once, as LaTeX (.tex) source. For any application with a job description, the app extracts requirements from the description using a built-in vocabulary and marks which appear in the resume. It does not use AI.
**User stories:**

- US-10: As the owner, I want to see which requirements of a posting my resume covers so that I can decide whether to apply and what to emphasise.

**Behavior & rules:**

- **Resume:** each account has one resume. Settings has a text area where the owner pastes LaTeX source. Saving replaces the previous resume. The maximum length is 50,000 characters.
- **Resume text preparation:**
  - LaTeX comments (from an unescaped `%` to the end of the line) are ignored.
  - Command names such as `\textbf` or `\item` are removed, and the text inside their braces is kept.
  - Escaped characters such as `\&` and `\%` are read as the literal character.
- **Vocabulary:** the app ships with a fixed list of at least 150 skill terms. The list covers programming languages, frameworks, databases, cloud platforms, tools, and practices (e.g. CI/CD, TDD). Each term has a canonical name and aliases. For example, PostgreSQL has the aliases "Postgres", "PostgreSQL" and "psql".
- **Matching:**
  - A term is found in a text when the canonical name or any alias appears as a whole word or phrase.
  - Matching ignores case, except for terms marked case-sensitive.
  - Short, ambiguous terms (for example "Go", "R", "C") are marked case-sensitive and must appear exactly as written. "Golang" is an alias for Go.
- **Comparison:** run from an application that has job description text.
  - **Requirements:** each distinct vocabulary term found in the job description. Each is listed once, under its canonical name.
  - Each requirement is marked **Matched** if it is found in the prepared resume text, otherwise **Missing**.
  - **Match percentage** = Matched ÷ total requirements × 100, rounded to the nearest whole number.
  - The result shows Matched and Missing requirements as separate groups, the match percentage, and the time the comparison was run.
- Each application stores at most one comparison. Running again replaces it.
- A saved comparison is not updated automatically when the resume or job description changes. The result shows "Resume or job description changed since this comparison" when either was edited after the run.

**States & edge cases:**

- If no resume is saved, the Compare action is disabled with "Add your resume in Settings first."
- If the application has no job description text, the Compare action is disabled with "Paste the job description first."
- If no vocabulary terms are found in the job description, the result shows "No recognised requirements found." No percentage is shown, and nothing is divided by zero.
- A resume over 50,000 characters is rejected with a message stating the limit.
- Malformed LaTeX (for example unbalanced braces) does not cause an error. Unparseable fragments are treated as plain text.

**Acceptance criteria:**

- [ ] AC-06.1: Given a resume containing `\textbf{PostgreSQL}` and a job description mentioning "Postgres" and "Kubernetes", when compared, then PostgreSQL is Matched, Kubernetes is Missing, and the match percentage is 50.
- [ ] AC-06.2: Given a job description mentioning "PostgreSQL" three times, when compared, then PostgreSQL is listed once.
- [ ] AC-06.3: Given a resume line `% Kubernetes` (a comment only), when compared against a job description requiring Kubernetes, then Kubernetes is Missing.
- [ ] AC-06.4: Given a job description containing "go to market" and no other Go reference, when compared, then Go is not a requirement.
- [ ] AC-06.5: Given a job description with no vocabulary terms, when compared, then "No recognised requirements found" is shown with no percentage.
- [ ] AC-06.6: Given no saved resume, the Compare action is disabled with the stated message.
- [ ] AC-06.7: Given an existing comparison, when the comparison is run again, then only one comparison exists for that application and it has the new run time.
- [ ] AC-06.8: Given a comparison, when the resume is edited afterwards, then the "changed since this comparison" notice is shown.
- [ ] AC-06.9: Given a resume of 50,001 characters, when saving, then it is rejected.
- [ ] AC-06.10: Given a resume with unbalanced braces, when compared, then a result is produced without error.

## 8. Content & Data (user perspective)

- **Account:** the sign-in email, a password, and settings (quiet threshold, time zone, resume). There are two accounts, the owner and the demo account, both created at setup.
- **Company:** name, website and notes. It has applications and contacts. It is created and edited by its account.
- **Application:** the fields listed in F-02, plus last activity, whether it is quiet, and at most one comparison. It belongs to one company.
- **Contact:** the fields listed in F-03. It belongs to one company and is linked to zero or more of that company's applications.
- **Interview stage:** the fields listed in F-03 and a position in the application's stage order.
- **Comparison:** requirements with Matched or Missing, the match percentage, and the run time.
- **Run records:** the time and result of the latest daily quiet check and the latest digest run, shown in Settings.
- **Visibility:** everything is private to the account that owns it. Nothing is public except the sign-in page and the API documentation.
- **Vocabulary:** part of the product, not editable in the app.

## 9. Non-Functional Requirements

| ID     | Requirement                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Every API endpoint appears in interactive API documentation, with accurate request and response schemas and error responses.                                                                                         |
| NFR-02 | Once the server is awake, list and detail requests respond within 1 second with 500 applications in an account. Cold-start delay from the hosting tier is excluded and documented in the README.                     |
| NFR-03 | All screens are usable at 375 px width with no horizontal page scrolling.                                                                                                                                            |
| NFR-04 | Passwords are stored only in a salted, slow-hash form. No secret, key or password appears in the repository; a committed example environment file lists every required variable.                                     |
| NFR-05 | Scheduled jobs (F-04, F-05) are safe to run more than once for the same period, with no duplicate flags or emails, and they tolerate the server being asleep when triggered.                                         |
| NFR-06 | External services (email provider, scheduler) are replaced by test doubles in automated tests. Anything verified only with test doubles is listed as "not yet verified live" until one real end-to-end run succeeds. |
| NFR-07 | Every form shows validation errors next to the field concerned. Errors never show raw stack traces.                                                                                                                  |
| NFR-08 | All dates are stored unambiguously and displayed in the account's time zone.                                                                                                                                         |

## 10. Constraints

Stated by the owner:

- **Backend:** Python 3.14 + FastAPI, managed with uv. Tests use pytest and pytest-asyncio; linting and formatting use ruff.
- **Frontend:** Next.js 16 + React 19 + Tailwind 4, managed with bun.
- **Database:** Neon Postgres (free tier). **Cache and rate limiting:** Upstash Redis (free tier). **Scheduled and background jobs:** Upstash QStash, with no dedicated worker process.
- **Email:** Resend or SendGrid, chosen at build time by free-tier limits.
- **Hosting:** the frontend on Vercel or Netlify; the API on Render's free tier, which sleeps after about 15 minutes idle. This tradeoff must be noted in the README.
- **Budget:** free tiers only.
- **Deadline:** agent build work is funded by API credits that expire **19 September 2026**.
- **Portfolio intent:** backend depth must be visible (scheduled jobs, relational data, real authentication, documented API).
- The owner does **not** require any specific session or token mechanism. The authentication mechanism is the building agent's choice.
- Stack pieces must not be swapped without the owner's approval.

## 11. Assumptions

- A-01: The digest goes to the account's sign-in email; there is no separate "digest email" setting.
- A-02: Wishlist applications can be flagged as quiet, as a nudge to apply or drop them.
- A-03: A single currency code per application is enough; no currency conversion is done.
- A-04: The owner creates both accounts and resets passwords through a documented manual step, not through the UI.
- A-05: The daily limit of 5 emails is enough, since only the owner account sends email (one digest per week).
- A-06: Reviewers may change demo data. Keeping it tidy is handled manually by re-running the seed.
- A-07: The resume is written in English, and the vocabulary is English-only.

## 12. Risks

| ID   | Risk                                                                                                      | Mitigation                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | The deadline is three days away; the full MVP may not fit.                                                | Build in the order F-01 → F-02 → F-03 → F-04 → F-05 → F-06. If time runs short, F-06 moves to Future Features first.               |
| R-02 | The API host sleeps, so scheduled triggers or the reviewer's first visit hit a cold start.                | Jobs are idempotent and tolerate late runs (NFR-05, F-05). The README warns reviewers that the first load may take about a minute. |
| R-03 | The digest lands in spam because the sender domain is unverified.                                         | Verify a sender domain with the provider. Check G-03 against the inbox, not just the provider's "sent" status.                     |
| R-04 | Keyword matching gives false positives or negatives (ambiguous terms, terms missing from the vocabulary). | Case-sensitive handling for short terms, an alias list, and test cases for known traps. AI extraction is planned as FF-03.         |
| R-05 | Custom LaTeX macros in the resume hide skills from matching.                                              | Keep brace contents, and treat anything unparseable as text (AC-06.10).                                                            |
| R-06 | Integrations pass tests with test doubles but fail live.                                                  | NFR-06: one real end-to-end run each for the scheduler and email before calling them done.                                         |
| R-07 | A reviewer edits or deletes demo data, leaving it empty for the next reviewer.                            | A seed that can be re-run (A-06). Auto-reset is a possible future item.                                                            |

## 13. Open Questions

- OQ-01: Email provider: Resend or SendGrid. This is decided at build time from current free-tier limits and is not a blocker.
- OQ-02: Which domain the digest is sent from. It is needed before G-03 can pass, but it does not block building.
- OQ-03: Whether the demo credentials appear on the sign-in page as well as in the README. Not a blocker; the default is README only.

## 14. Future Features (post-launch backlog)

### Product depth

| ID    | Feature                                                                                                                                            | Why it's valuable                           | Why deferred                                                                      | Depends on |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| FF-03 | AI-powered job description extraction: understands phrases like "3+ years of Go" and required vs nice-to-have, and isn't limited to the vocabulary | Much more accurate fit analysis             | Ongoing API cost; keyword matching proves the flow first                          | F-06       |
| FF-01 | Custom statuses: user-defined statuses mapped to active or closed for quiet detection                                                              | Fits different hiring pipelines             | The fixed list covers the MVP; the owner wants it designed for later              | F-02, F-04 |
| FF-02 | PDF resume upload with text extraction                                                                                                             | Most resumes exist as PDFs                  | Pasting `.tex` covers the owner's own use                                         | F-06       |
| FF-04 | Per-application reminder emails with repeat and reset rules                                                                                        | A more immediate nudge than a weekly digest | Adds dedupe and repeat logic plus a second email type; the digest covers the need | F-04, F-05 |

### Integrations

| ID    | Feature                                                                                                                 | Why it's valuable             | Why deferred                                                                                     | Depends on |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| FF-05 | Gmail integration: detects rejection and interview emails and updates statuses automatically, without duplicate updates | Removes manual status updates | Needs OAuth app registration, polling or webhooks, and a live end-to-end test; stretch goal only | F-01, F-02 |

### Accounts

| ID    | Feature                                                 | Why it's valuable     | Why deferred                              | Depends on |
| ----- | ------------------------------------------------------- | --------------------- | ----------------------------------------- | ---------- |
| FF-06 | "Forgot password" email flow and in-app password change | Self-service recovery | With two accounts, a manual reset is fine | F-01, F-05 |

## 15. Glossary

| Term                 | Definition                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Owner account        | The single real user's account; the only account that sends email.                                  |
| Demo account         | A seeded account for portfolio reviewers; never sends email.                                        |
| Application          | One job the owner is pursuing or has pursued at one company.                                        |
| Company              | An employer. It has applications and contacts.                                                      |
| Contact              | A person at a company, optionally linked to that company's applications.                            |
| Interview stage      | One round in an application's hiring process, with an outcome.                                      |
| Status               | One of Wishlist, Applied, Interviewing, Offer, Rejected, Withdrawn.                                 |
| Active status        | Wishlist, Applied or Interviewing. Only these can be quiet.                                         |
| Last activity        | The latest creation or edit of an application or its interview stages (F-04).                       |
| Quiet threshold      | The per-account number of days (1–90, default 7) after which an active application counts as quiet. |
| Quiet application    | An application with an active status and no activity for at least the quiet threshold.              |
| Daily check          | The scheduled job that flags quiet applications once per day.                                       |
| Needs follow-up list | The home-screen list of quiet applications.                                                         |
| Digest               | The Monday 08:00 email listing quiet applications and stages in the next 7 days.                    |
| Resume               | The account's single pasted LaTeX (.tex) resume source.                                             |
| Job description      | The posting text pasted into an application.                                                        |
| Vocabulary           | The built-in list of skill terms with canonical names and aliases.                                  |
| Requirement          | A vocabulary term found in a job description.                                                       |
| Comparison           | The saved result of checking an application's requirements against the resume.                      |
| Match percentage     | Matched requirements ÷ all requirements × 100, rounded.                                             |

## 16. Notes for the Building Agent

- This PRD defines **what** to build. Architecture, data design, planning and task breakdown are your decisions, within the owner's stated constraints (Section 10).
- Build only the MVP features (Section 7). Do not implement anything in Non-goals or Future Features.
- Acceptance criteria are the definition of done.
- Where this PRD is silent, choose the simplest behavior consistent with the goals, and record the decision.
