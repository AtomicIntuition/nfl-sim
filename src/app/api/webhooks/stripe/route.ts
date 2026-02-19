import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// ============================================================
// POST /api/webhooks/stripe
// Handles Stripe webhook events for subscription management.
// ============================================================

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  });
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  let event: Stripe.Event;

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Stripe signature header.' },
        { status: 400 }
      );
    }

    // Verify the webhook signature to ensure the event is from Stripe
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown verification error';
    console.error('Stripe webhook signature verification failed:', message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      // ---- Checkout completed (new subscription) ----
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        console.log(
          `[Stripe] Checkout completed: customer=${customerId}, subscription=${subscriptionId}`
        );

        // TODO: Provision premium access for the user
        // - Look up internal user by Stripe customer ID or session metadata
        // - Update user record with subscription status = 'active'
        // - Grant premium features (ad-free viewing, exclusive stats, etc.)
        break;
      }

      // ---- Subscription updated (plan change, renewal, etc.) ----
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;

        console.log(
          `[Stripe] Subscription updated: customer=${customerId}, status=${status}`
        );

        // TODO: Sync subscription status with internal user record
        // - Update user's subscription status (active, past_due, etc.)
        // - Adjust feature access based on new plan if plan changed
        break;
      }

      // ---- Subscription deleted (cancellation) ----
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        console.log(
          `[Stripe] Subscription deleted: customer=${customerId}`
        );

        // TODO: Revoke premium access
        // - Set user subscription status to 'canceled'
        // - Remove premium feature access
        // - Optionally retain data for potential resubscription
        break;
      }

      default: {
        // Log unhandled event types for monitoring
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Stripe webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed.' },
      { status: 500 }
    );
  }
}
