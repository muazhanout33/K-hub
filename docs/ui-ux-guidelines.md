# K-HUB Sports Club – Premium UI/UX Design Specification

> **Role**
>
> You are a **Senior UI/UX Designer** with **15+ years** of experience designing world-class SaaS products, booking platforms, and premium digital experiences.
>
> Your mission is to design a **premium website** for **K-HUB Sports Club** that allows users to:
>
> - Book sports courts
> - Explore club services
> - View memberships
> - Discover sponsors
> - Register for events
> - Contact the club
>
> The final experience should feel comparable to products from **Apple, Stripe, Airbnb, Linear, Framer, Vercel, and Nike**—not a traditional local sports club website.

---

# Design Inspiration

- Apple
- Stripe
- Airbnb
- Linear
- Framer
- Vercel
- Nike

---

# Design Principles

- Modern Minimal Luxury
- Premium SaaS Experience
- Fully White Theme
- Clean Layout
- Large White Space
- Large Rounded Cards
- Soft Shadows
- Elegant Typography
- Smooth Micro Interactions
- Fast & Responsive UX

---

# Color Palette

| Usage | Color |
|--------|--------|
| Background | `#FAFAFA` |
| Cards | `#FFFFFF` |
| Primary | `#16A34A` |
| Dark Green | `#15803D` |
| Light Green | `#DCFCE7` |
| Text | `#111827` |
| Secondary Text | `#6B7280` |
| Border | `#E5E7EB` |
| Success | `#22C55E` |
| Warning | `#FACC15` |
| Error | `#EF4444` |
| Accent Blue | `#2563EB` |

---

# Typography

**Font Family**

- Inter

### Headings

- Bold

### Body

- Regular

### Sizes

- Hero Heading → 48px
- Section Heading → 32px
- Body → 16px
- Small Text → 14px

---

# Layout

## Desktop

- Fixed Left Sidebar
- Width: **280px**
- Height: **100vh**
- Main Content on the Right
- White Background
- White Cards
- Soft Shadows

---

# Sidebar

## Top Area

- K-HUB Sports Club Logo
- Premium Sports Experience

## Navigation

Each navigation item includes:

- Icon
- Title
- Hover Animation
- Active State
- Rounded Card
- Light Green Background
- Green Left Indicator

### Menu Items

- Home
- Courts
- Book Court
- Membership
- Sponsors
- Events
- About
- Contact

## Bottom Area

- User Profile
- Notifications
- Help
- Settings

---

# Hero Section

## Layout

50 / 50 Split

---

## Left Side

### Badge

> The Best Sports Experience

### Title

```
Book Your Game
In Seconds
```

- "Seconds" highlighted using Primary Green.

### Description

> Find available courts, reserve your favourite time, and enjoy the game with your friends.

### Buttons

Primary

- Book Now

Secondary

- Explore Courts

### Feature Highlights

Each item includes an icon.

- Easy Booking
- Secure Payment
- Premium Facilities

---

## Right Side

Large Premium Court Image

- Radius: 32px

Floating Information Card

Contains:

- Next Available Court
- Court Name
- Today's Available Time
- Calendar Icon
- Soft Shadow

---

# Featured Courts

## Title

Our Courts

## Layout

4 Column Grid

Each Court Card contains:

- Large Image
- Court Name
- Sport Type
  - Football
  - Tennis
  - Padel
- Players
- Indoor / Outdoor
- Price Per Hour
- Status Badge
  - Available
  - Booked
  - Starts Soon
- Book Now Button

### Hover Effects

- Image Zoom
- Card Lift
- Shadow Increase

---

# Live Availability

## Title

Available Today

Display for every court:

- Court Name
- Current Time
- Current Status

Include a horizontal timeline using:

- Green → Available
- Orange → Starts Soon
- Red → Booked

---

# Booking Section

Large Booking Card

## Booking Flow

```
Choose Court
      ↓
Choose Date
      ↓
Choose Time
      ↓
Your Details
      ↓
Payment
```

Inside the card:

### Court Preview

- Image
- Name
- Price
- Players
- Surface Type

### Calendar

Modern Calendar UI

### Time Slots Grid

Available

- Green Border

Booked

- Red

Selected

- Dark Green

Include Hover Animation.

### CTA

Large Continue Button

---

# Why Choose Us

Display 4 Feature Cards.

Each card contains:

- Icon
- Title
- Description
- Hover Effect

Features:

- Online Booking
- Premium Courts
- Flexible Memberships
- Secure Payments

---

# Membership Plans

## Title

Membership Plans

Display 3 Pricing Cards.

### Plans

- Basic
- Premium
- VIP

Each card includes:

- Price
- Features
- Join Membership Button

The **Premium** plan should be visually larger and highlighted.

---

# Sponsors

## Title

Official Sponsors

Carousel Layout.

Each Sponsor Card contains:

- Logo
- Company Name
- Discount Offer
  - 10%
  - 15%
  - 20%
- View Offer Button

---

# Events

Large Event Cards.

Each event includes:

- Image
- Title
- Date
- Participants
- Register Button

---

# Testimonials

Slider Component.

Each Review Card contains:

- Avatar
- Name
- Rating
- Comment

---

# FAQ

Accordion Layout.

Requirements:

- Smooth Expand / Collapse Animation
- Clean Typography
- Minimal Design

---

# Contact Section

## Left Side

Contact Form

Fields:

- Name
- Phone
- Email
- Message

---

## Right Side

- Google Map
- Club Information
- Phone
- Email
- Working Hours
- Social Media Links

---

# Footer

Include:

- Logo
- Quick Links
- Membership
- Sponsors
- Contact
- Newsletter
- Social Icons
- Copyright

---

# Components

## Buttons

### Primary

- Green Filled

### Secondary

- White Background
- Green Border

Properties:

- Radius: 14px
- Height: 52px

Hover:

- Scale
- Shadow
- 300ms Transition

---

## Cards

Properties

- Radius: 24px
- Padding: 24px
- Soft Shadow

Hover

- Lift
- Scale

---

## Inputs

Properties

- Radius: 14px
- Height: 52px
- Light Gray Border

Focus

- Green Border

---

## Icons

Use:

- Lucide Icons
- Outlined Style
- Minimal Appearance

---

# Animations

Use **Framer Motion**.

Include:

- Fade In
- Slide Up
- Scale
- Hover Effects
- Smooth Scroll
- Loading Skeletons
- Page Transitions

Animations should feel smooth, elegant, and premium.

---

# Responsive Design

Mobile-First Approach.

Requirements:

- Sidebar becomes Drawer
- Floating Book Button
- Cards become Single Column
- Fully responsive sections
- Smooth experience across all screen sizes

---

# Development Requirements

The design must be implementation-ready using:

- Next.js
- Tailwind CSS
- TypeScript

Architecture should be:

- Reusable
- Scalable
- Maintainable
- Component-Based

---

# Final Quality Requirements

The final UI/UX must deliver a premium global experience comparable to:

- Apple
- Stripe
- Airbnb
- Linear
- Framer
- Vercel
- Nike

Focus heavily on:

- Typography
- White Space
- Visual Hierarchy
- Micro Interactions
- Hover States
- Loading States
- Accessibility
- Consistency
- Responsive Behavior
- Pixel-Perfect Components

Every component should be production-ready and suitable for direct implementation in a modern Next.js application.

---

# Final Design Goal

The finished website should feel like a premium SaaS product rather than a traditional sports club website.

Every component should be:

- Reusable
- Responsive
- Accessible
- Scalable
- Maintainable
- Production-Ready

The entire design should be ready for direct implementation using:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion

The final user experience should be comparable to products built by:

- Apple
- Stripe
- Airbnb
- Linear

The website should demonstrate exceptional attention to:

- Visual Hierarchy
- Typography
- White Space
- Accessibility
- Micro Interactions
- Hover States
- Loading States
- Responsive Behavior
- Pixel-Perfect UI
- Consistent Design System

Every screen should communicate quality, trust, elegance, and speed—making users feel they are interacting with a world-class digital product rather than a traditional sports club website.
