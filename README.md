# EquipRent — Backend API

EquipRent is a full-stack Equipment Rental Platform where customers can rent equipment, owners can manage equipment listings and rentals, and administrators can manage the marketplace.

This repository contains the Express.js and MongoDB backend for the EquipRent platform.

## Live Links

- **Live Website:** https://equiprent-zeta.vercel.app
- **Backend API:** https://equiprent-server.onrender.com
- **Frontend Repository:** https://github.com/sushamaray/equiprent-client
- **Backend Repository:** https://github.com/sushamaray/equiprent-server

## Key Features

### Authentication and Authorization

- Email and password authentication using Better Auth
- Google Social Login integration
- JWT authentication using Better Auth and JOSE
- MongoDB Adapter for user management
- Role-based access control for Customers, Owners, and Admins
- Protected API endpoints and middleware

### Equipment Management

- Equipment creation, updating, and deletion
- Equipment image upload support using ImgBB
- Equipment approval and rejection
- Equipment categories and conditions
- Daily, weekly, and monthly rental pricing
- Available quantity management
- Equipment search, filtering, sorting, and pagination
- Owner-specific equipment management

### Rental Booking

- Equipment rental booking system
- Date-based rental price calculation
- Quantity-based rental calculation
- Equipment availability verification
- Concurrent reservation protection
- Customer booking history
- Owner rental management
- Booking confirmation, rejection, and cancellation functionality

### Stripe Payment Integration

- Stripe Checkout integration
- Secure payment verification using webhooks
- Booking creation after successful payment
- Payment transaction storage in MongoDB
- Duplicate webhook event protection
- Checkout reservation management
- Failed and expired checkout handling

### Customer Features

- Browse approved equipment
- View equipment details
- Add and remove favorite equipment
- Create rental reservations
- Complete payments through Stripe Checkout
- View rental history
- Manage profile information

### Owner Features

- Add and manage equipment
- Update equipment prices and availability
- View equipment rental bookings
- Manage eligible booking statuses
- View rental business analytics
- Track total earnings and monthly earnings

### Admin Features

- Manage registered users
- Manage customer and owner roles
- Approve and reject equipment
- Update and delete equipment listings
- Monitor rental bookings
- View platform analytics, bookings, and revenue

## Technologies and npm Packages

**Backend Technologies**

- Node.js
- Express.js 5
- MongoDB
- Better Auth
- JWT
- Stripe

**Dependencies**

- `express` — Backend API framework
- `mongodb` — MongoDB database driver
- `better-auth` — Authentication
- `@better-auth/mongo-adapter` — MongoDB integration
- `jose` — JWT verification
- `stripe` — Stripe payments and webhooks
- `cors` — Cross-origin resource sharing
- `dotenv` — Environment configuration
- `multer` — File upload handling

**Development Dependency**

- `nodemon` — Development server automatic restart

## Local Installation

1. Clone the repository.

   ```bash
   git clone https://github.com/sushamaray/equiprent-server.git
   ```

2. Open the project directory.

   ```bash
   cd equiprent-server
   ```

3. Install dependencies.

   ```bash
   npm install
   ```

4. Create a `.env` file and configure the required services.

   Configuration includes:

   - MongoDB connection credentials
   - Better Auth URL and secret
   - Frontend and backend application URLs
   - Google OAuth credentials
   - Stripe API and webhook credentials
   - ImgBB API credentials

   Keep all actual credentials private.

5. Run the development server.

   ```bash
   npm run dev
   ```

6. Run the production server.

   ```bash
   npm start
   ```

The default local backend address is:

`http://localhost:5000`

## API Overview

The backend includes endpoints for:

- `/api/auth` — Authentication
- `/api/profile/me` — User profile
- `/api/equipment` — Equipment management
- `/api/bookings` — Rental bookings
- `/api/payments` — Checkout and payments
- `/api/analytics/admin` — Admin analytics
- `/api/analytics/owner` — Owner analytics
- `/api/admin` — Administrative management

Protected endpoints require appropriate authorization.

## User Roles

| Role | Permissions |
|---|---|
| Customer | Browse, favorite, book, pay, and manage rentals |
| Owner | Manage equipment, bookings, and business analytics |
| Admin | Manage users, equipment, rentals, and platform analytics |

## Rental Payment Process

1. A customer selects equipment, rental dates, and quantity.
2. The backend validates the rental request.
3. The server calculates the rental amount.
4. The system creates a checkout reservation.
5. The customer is redirected to Stripe Checkout.
6. Stripe processes the payment.
7. The webhook verifies the payment.
8. A successful verified payment creates a booking.
9. Payment transaction details are saved in MongoDB.
10. The customer can view the rental in their rental history.

## Testing

Run the default rental pricing test:

```bash
npm test
```

Additional integration tests:

```bash
node scripts/test-equipment-fields.js
node scripts/test-equipment-pricing-update.js
node scripts/test-checkout-reservation.js
```

Other test scripts are available in the `scripts` directory.

## Security

- JWT verification using cryptographic signatures
- Database-backed role authorization
- Protected private API endpoints
- Secure environment variable management
- Server-side rental amount calculation
- Stripe webhook signature verification
- Equipment availability checks
- Duplicate webhook protection
- MongoDB transaction-based payment processing

Do not upload `.env` files or private API keys to GitHub.

## Deployment

Backend hosting: Render

Frontend hosting: Vercel

Production deployment requires valid environment variables, working MongoDB connectivity, configured CORS origins, valid Better Auth settings, and a working Stripe webhook endpoint.

## Project Information

**Project:** EquipRent — Equipment Rental Platform

**Assignment:** Programming Hero Assignment 9

**Category:** 003

**Project Type:** Full-stack Web Application