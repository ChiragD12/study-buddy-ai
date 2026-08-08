# Study Buddy AI

Build the Foundation for a Local-First Personal Exam Assistant PWA

Build the production-quality foundation and UI architecture for a personal, iPhone-first study PWA.

This is not a public SaaS application and must not be designed around accounts, authentication, cloud databases, or Lovable-specific runtime infrastructure.

The application will eventually become a personal AI-powered exam assistant for competitive exams such as Haryana High Court Clerk, HPSC, RPSC, UPSC and other exams. The user will add their own exams and exam dates. Nothing about a specific exam should be hardcoded into the architecture.

The most important requirement is:

After this project is exported from Lovable, it must be a normal, self-contained web application that can be developed and deployed independently of Lovable. Lovable must not become a runtime dependency.

The initial implementation should establish the architecture, design system, navigation, PWA foundation, local persistence layer, AI-provider abstraction, notification architecture, and major feature shells. Do not attempt to finish every advanced feature in this first pass.

1. TECH STACK

Use:

React

TypeScript

Vite

TanStack Router

Tailwind CSS

shadcn/ui where useful, but heavily customized

Dexie for IndexedDB

vite-plugin-pwa

custom service worker using the injectManifest approach

Do not replace this with Next.js, Remix, Astro, SvelteKit, React Native, Flutter, etc.

Keep dependencies deliberately lightweight.

The application is primarily a client-side PWA.

2. ABSOLUTE ARCHITECTURAL REQUIREMENTS

This application must be:

Local-first

User data belongs to the user's device.

Use:

IndexedDB via Dexie for substantial application data

localStorage only for tiny preferences where appropriate

Do not use:

Supabase

Firebase

Lovable Cloud database

authentication

user accounts

server-side application database

analytics

telemetry

tracking

The app must remain useful when completely offline except for features that inherently require the internet, such as Gemini requests, current-affairs retrieval, and push infrastructure.

Create a proper repository/data-access abstraction so feature code does not directly manipulate IndexedDB.

Recommended architecture:

UI
↓
Feature services
↓
Repositories
↓
Dexie
↓
IndexedDB

Do not scatter Dexie/database calls throughout React components.

3. PROJECT STRUCTURE

Use a feature-oriented architecture rather than putting everything into a generic components directory or giant App.tsx.

Use a structure along these lines, adapting where necessary:

src/
app/
router/
layout/
providers/

features/
assistant/
exams/
notes/
current-affairs/
answer-writing/
vault/
documents/
progress/
notifications/
settings/

data/
db/
repositories/
migrations/
schemas/

ai/
providers/
tools/
context/
types/

pwa/
service-worker/
push/

shared/
components/
hooks/
utils/
types/
constants/

Do not create giant monolithic files.

Keep domain logic separate from presentation.

4. PWA FOUNDATION

Build the PWA foundation correctly from the beginning.

Use:

vite-plugin-pwa

injectManifest

a project-owned/custom service worker

The service worker must be architected so it can later handle:

app-shell caching

offline operation

cache updates

Web Push events

notification clicks

navigation back into the appropriate PWA route

Do not bury notification functionality inside random UI components.

Create a dedicated notification/push architecture.

The PWA must include:

proper web app manifest

installable configuration

icons/placeholders

theme colors

standalone display

responsive viewport configuration

safe-area support

offline fallback

sensible caching strategy

Design specifically for an iPhone Home Screen PWA.

5. IOS-FIRST UX

The primary device is an iPhone.

Do not simply make a desktop dashboard responsive.

Design mobile-first.

Support:

iOS safe areas using env(safe-area-inset-*)

large touch targets

comfortable typography

keyboard-safe layouts

bottom-sheet patterns where appropriate

smooth navigation

subtle 60fps-friendly animations

dark/light/system appearance

standalone PWA presentation

mobile-friendly file handling

mobile-friendly writing interface

Avoid excessive animations, large dependencies, WebGL, Three.js, or anything likely to unnecessarily heat/battery-drain an iPhone.

The UI should feel like a polished modern iPhone application rather than a website squeezed into a phone.

6. DESIGN DIRECTION

Do not create a generic SaaS dashboard.

The visual language should feel:

premium

calm

modern

intelligent

clean

highly readable

iPhone-native in spirit

spacious

tactile

focused

Use a strong design-token system for:

typography

spacing

radii

shadows

colors

surfaces

interactive states

dark mode

Avoid excessive cards everywhere.

Avoid a giant dashboard containing every feature.

7. LANDING PAGE = AI ASSISTANT

The default landing page must be a chat/assistant experience.

Do NOT make the landing page a conventional dashboard.

The user should open the app and immediately see something conceptually like:

Good morning

What do you want to do?

[ Ask anything... ]

Verify my notes
What should I study today?
Today's current affairs
Create a revision sheet
Practice answer writing

The chat should eventually become the primary interface for interacting with the application.

For this foundation build:

create the polished chat UI

conversation history UI

message states

streaming/loading state placeholders

error state

attachment/action affordances

generated-artifact UI placeholders

empty state

chat input

mobile keyboard-safe behavior

Do not attempt to build the complete Gemini agent yet.

Establish the architecture for it.

8. STARTUP STUDY SNAPSHOT

The landing page may display a temporary startup overlay called:

Study Snapshot

It should appear when the application starts.

It can eventually contain:

nearest upcoming exam

exam countdown

overall progress

today's activity

current focus

other upcoming exams

Include a dismiss X.

When dismissed:

immediately hide it

keep it hidden for the remainder of the current app session

show it again on the next app launch

Store an optional persistent setting:

Show Study Snapshot on launch

ON/OFF.

The chat must remain the actual landing page underneath the overlay.

Do not turn the snapshot into a permanent dashboard.

9. NAVIGATION

Use a side navigation drawer.

On desktop it may be a sidebar.

On iPhone it should become a polished slide-out navigation drawer.

Do not put every feature on the landing page.

Navigation should conceptually contain:

ASSISTANT

Chat

STUDY

Exams

Notes

Current Affairs

Answer Writing

VAULT

All Files

PDFs

Images

Saved Material

PROGRESS

Study Plan

Progress

SYSTEM

Notifications

AI / Gemini

Appearance

Data & Backup

Privacy

The exact grouping can be improved during implementation, but keep the hierarchy clean.

10. EXAMS MUST BE USER-CREATED

Do not hardcode:

Haryana High Court Clerk

UPSC

HPSC

RPSC

any particular exam

The user must be able to create an exam.

Initial model:

Exam

- id
- name
- examDate
- description
- priority
- createdAt
- updatedAt
- optional syllabus
- optional source/official notification reference

The user should be able to:

add exam

edit exam

delete exam

select active exam

view countdown

eventually associate notes/material/current affairs/writing with exams

The application should support multiple simultaneous exams.

Exam dates must be data-driven.

The nearest/most relevant exam can later be used by the assistant to determine urgency.

11. NOTES FOUNDATION

Create the Notes feature and data architecture.

Notes should eventually support:

title

content

exam association

subject

topic

tags

source

confidence

verification status

created/updated dates

verification history

The user will eventually import/paste large quantities of personal notes.

Do not build a fake demo-only notes page.

Build the real local persistence architecture.

Include:

notes list

search UI

note detail/editor

create/edit/delete

tags/metadata

empty states

local persistence

Prepare the architecture for future Gemini verification without actually building the full verification system yet.

12. CURRENT AFFAIRS FOUNDATION

Create a Current Affairs section.

Do NOT hardcode fake current-affairs data.

The architecture must support a provider abstraction:

CurrentAffairsProvider

so future providers can include RSS/API/custom retrieval mechanisms without changing the UI.

Current affairs will eventually be personalized based on:

user's exams

exam dates

subjects/syllabus

recency

importance

historical exam usefulness

However:

Do NOT display numerical relevance ratings.

The relevance engine will eventually work internally and simply determine ordering.

The user should see:

Today's Important Current Affairs

not:

HC Clerk relevance: 9/10

Build the UI and provider abstraction only at this stage.

13. ANSWER WRITING FOUNDATION

Create a first-class Answer Writing area.

It must support the eventual distinction between:

English / Clerk-style writing

letter writing

précis writing

essay

comprehension

other English subjective practice

Civil-services writing

GS answers

essays

structured answers

timed answers

word limits

The foundation should include:

writing prompt list

writing workspace

timer placeholder

word counter

save draft

attempt history structure

evaluation placeholder

Do not silently overwrite user writing.

Gemini evaluation will eventually be optional.

14. VAULT

Create a local-first Vault.

The Vault will eventually contain:

imported notes

generated PDFs

generated images

current affairs material

writing material

Gemini-generated study material

other user files

Use IndexedDB/Dexie for metadata and appropriate browser storage for files.

Provide:

list/grid views where appropriate

search

filters

favorites

file metadata

open/view

delete

save to vault

Design the architecture for local export/import backups from the beginning.

15. DOCUMENT GENERATION ARCHITECTURE

The application will eventually generate PDFs locally.

Do not depend on an external document-generation SaaS.

Create an abstraction such as:

DocumentGenerator

which can eventually support:

A4 revision sheets

printable notes

study sheets

writing exercises

two-column layouts

minimal print layouts

Gemini should eventually generate the CONTENT/STRUCTURE.

The PWA should generate the actual PDF.

Do not ask Gemini to generate a PDF binary.

16. PRINTABLE IMAGE ARCHITECTURE

Similarly create a future-ready abstraction for printable visual sheets.

For text-heavy educational content, prefer:

Gemini structured content
↓
local HTML/SVG/canvas renderer
↓
PNG/image

This keeps text crisp and accurate.

Do not depend on AI image generation for ordinary educational revision sheets.

Actual AI image generation will eventually be handed off to ChatGPT.

17. CHATGPT IMAGE-GENERATION HANDOFF

The app will eventually allow the user to tell the assistant:

"Create an image showing the Fundamental Rights."

The app should generate a high-quality image-generation prompt and offer:

Open in ChatGPT

The handoff must be explicitly user initiated.

Do not assume undocumented ChatGPT iOS URL schemes.

The architecture must support:

Generate prompt

Show user what will be shared

Attempt supported handoff if available

Otherwise provide:

Copy prompt

Open ChatGPT

Do not send the user's entire vault or notes automatically.

Only the selected content needed for the requested prompt may be included.

For this foundation phase, establish the service/interface and UI placeholder rather than implementing an unreliable undocumented deep link.

18. GEMINI ARCHITECTURE

The user will supply their own Gemini API key through the application UI.

There must be a visible:

Settings → AI / Gemini

screen with:

API key input

show/hide key

Save

Test connection

Delete key

current configuration/status

no-key state

Do NOT require the user to modify source code or .env files.

Do NOT hardcode any API key.

Do NOT commit any key to the repository.

Do NOT send the key to Lovable infrastructure.

Do NOT send the key to Vercel.

Do NOT send the key to cron-job.org.

The key is intended for this personal application and will be used directly by the client.

Include a clear privacy/security warning that client-side API keys are accessible to the browser/device and should not be used on shared/public devices.

The application must remain functional when no Gemini key is configured.

19. GEMINI PROVIDER ABSTRACTION

Do not hardwire the entire application directly to Gemini calls.

Create an abstraction such as:

AIProvider

and a Gemini implementation.

Eventually it should support:

chat

structured output

function/tool calling

note verification

summarization

explanation

current-affairs processing

writing evaluation

study planning

document content generation

The assistant should eventually act as an orchestrator.

Conceptually:

User
↓
AI Assistant
↓
Tool Registry
├── Notes
├── Exams
├── Current Affairs
├── Vault
├── Writing
├── Documents
├── Progress
└── Notifications

For now, establish clean interfaces/types and the provider boundary.

Do not build a giant monolithic Gemini service.

20. IMPORTANT AI SECURITY/PRIVACY RULE

Never send the entire local database to Gemini.

The eventual tool architecture must retrieve only the minimum necessary information.

For example:

User:

"Verify this note."

Only the selected note should be sent.

User:

"What should I study?"

Only the relevant exam/progress/context needed for that decision should be provided.

User:

"Create a PDF from this section."

Only that selected section should be sent.

21. NOTIFICATIONS FOUNDATION

Build the architecture from the beginning for iOS Web Push.

Use:

service worker

Push API

Notifications API

dedicated push subscription management

permission handling

notification click handling

deep linking back into the PWA

Create a notification service abstraction.

Do not implement fake local notifications pretending to be server push.

The eventual infrastructure will be:

cron-job.org
↓
Vercel HTTPS endpoint/function
↓
Web Push
↓
iPhone Home Screen PWA
↓
Service Worker
↓
Notification

Do not use Vercel as the application's database.

Do not add authentication.

Do not use Vercel Cron unless later specifically required.

The architecture must allow notification subscription data to be registered with the eventual notification endpoint without coupling the whole application to Vercel.

Include clear onboarding/state for:

notifications unavailable

permission not yet requested

permission granted

permission denied

subscription active

subscription needs renewal/re-registration

Remember that iOS Web Push requires the web application to be installed as a Home Screen web app.

22. DATA EXPORT / IMPORT

This is mandatory for a local-first application.

Create the architecture/UI for:

Export all data

and

Import backup

The backup should eventually include:

exams

notes

writing

current affairs

settings

vault metadata

revision/study information

other application data

Use versioned schemas so future database migrations are possible.

Include:

schemaVersion

in exported data.

23. DATABASE MIGRATIONS

Create a migration strategy from the beginning.

Do not assume the first database schema will remain unchanged.

Use Dexie versioning appropriately.

Keep migration logic separate from UI.

24. PERFORMANCE

Optimize for an iPhone, not a high-end desktop.

Requirements:

lazy-load large routes

avoid unnecessary re-renders

avoid huge dependencies

don't load every feature on startup

keep the initial bundle reasonable

use code splitting

use efficient list rendering

keep animations lightweight

don't run continuous background JavaScript unnecessarily

don't use Three.js

don't create unnecessary timers

don't continuously poll

don't perform expensive calculations on every render

The chat landing page should load extremely quickly.

25. ACCESSIBILITY

Support:

keyboard navigation where relevant

VoiceOver-friendly semantics

visible focus states

sufficient contrast

semantic buttons/inputs

correct labels

accessible dialogs/drawers

reduced-motion preference

Do not rely solely on color to communicate status.

26. NO QUESTION ENGINE

Do NOT build:

MCQ engine

quiz engine

mock-test engine

question bank

The user already has a separate quiz application.

This application should focus on:

AI assistant

exams

notes

current affairs

answer writing

vault

documents

progress/planning

notifications

27. NO HARD-CODED EXAM CONTENT

Do not create fake Haryana HC Clerk syllabus data.

Do not create fake UPSC syllabus data.

Do not create fake current affairs.

Do not make assumptions about a specific examination's current syllabus.

The application must be generic and user-configurable.

28. NO FAKE FUNCTIONALITY

Do not create buttons that appear functional but are only decorative unless they are explicitly marked as placeholders.

Where advanced functionality is intentionally deferred, establish the correct interface and give the UI an appropriate "coming soon / not configured" state.

Do not fake push notifications.

Do not fake Gemini responses.

Do not fake current-affairs data.

Do not fake file generation.

29. DESIGN THE FOUNDATION, NOT THE FINAL PRODUCT

This is very important.

Do not spend the entire build trying to implement every advanced feature.

The goal of this Lovable phase is:

Build well

application shell

navigation

visual system

routing

local database architecture

migrations

repository architecture

PWA

custom service worker

push architecture

AI provider architecture

Gemini settings UI

assistant/chat shell

exam model

notes foundation

current-affairs foundation

answer-writing foundation

vault foundation

document-generation interfaces

ChatGPT handoff interface

export/import architecture

settings

Do NOT attempt to fully build yet

sophisticated AI agent

complete current-affairs ingestion pipeline

advanced Gemini tool execution

complex PDF layouts

complete ChatGPT deep linking

sophisticated study algorithms

advanced progress analytics

Those will be implemented later in VS Code.

30. PORTABILITY REQUIREMENT

The final repository must be portable.

Do not introduce:

Lovable-specific runtime APIs

Lovable-specific database dependencies

proprietary hosted state

generated code that requires Lovable to operate

unnecessary cloud services

The application must run locally with standard commands such as:

npm install
npm run dev
npm run build
npm run preview

The README must explain:

local development

production build

PWA deployment

architecture

database location

AI configuration

notification architecture

where future developers should implement features

31. CODE QUALITY

Write code that another developer can comfortably take over.

Requirements:

TypeScript strictness

meaningful names

small focused modules

typed domain models

typed repository interfaces

typed AI tool interfaces

error handling

loading states

empty states

no unnecessary any

no giant components

no giant utility files

no business logic embedded in presentation components

Add concise comments only where architecture is non-obvious.

32. FINAL UX TARGET

The finished foundation should feel like this:

Open the iPhone PWA.

A polished AI chat appears.

A temporary Study Snapshot may appear:

Haryana High Court Clerk

21 days remaining

Today's progress...

Current focus...

×

Dismiss it.

Now the screen is simply the assistant:

What do you want to do?

You can use the side menu to access:

Exams
Notes
Current Affairs
Answer Writing
Vault
Progress
Notifications
Settings

The application should feel like a personal exam operating system, not a generic dashboard.

33. MOST IMPORTANT CONSTRAINT

Before making architectural choices, prioritize these requirements in this order:

Portable/self-contained codebase

Local-first data ownership

Excellent iPhone PWA experience

Correct Web Push foundation

Clean AI/provider/tool architecture

Maintainability in VS Code

Performance

Visual polish

Do not sacrifice architecture for visual shortcuts.

Do not sacrifice local ownership for convenience.

Do not introduce backend infrastructure simply because it is easier for the initial implementation.

Build the foundation so that after exporting the repository from Lovable, the project can be handed to developers working entirely in VS Code with Codex, GitHub Copilot and Claude.

At the end, provide a concise README documenting the architecture, key directories, dependencies, local development commands, PWA setup, local database approach, AI configuration approach, and future implementation boundaries.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4255b495-9aa0-4974-ba69-ffd1e1294653).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
