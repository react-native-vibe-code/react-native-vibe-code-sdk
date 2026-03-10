'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Check, Crown, Loader2, Settings, X } from 'lucide-react'
import { authClient } from '@/lib/auth/client'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { Badge } from './ui/badge'
import { getSubscriptionStatus } from '@/app/(app)/actions/subscription'
import posthog from 'posthog-js'

interface SubscriptionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Plan {
  name: string
  price: number
  originalPrice: number
  period: string
  features: string[]
  productId?: string
  popular?: boolean
}

const plans: Plan[] = [
  {
    name: 'Start',
    price: 9.99,
    originalPrice: 20,
    period: 'mo',
    features: [
      '100 messages monthly',
      'Private projects',
      'Code editor',
      'History restore',
      'Email support',
    ],
    productId: process.env.NEXT_PUBLIC_POLAR_START_PRODUCT_ID,
  },
  {
    name: 'Pro',
    price: 19.99,
    originalPrice: 45,
    period: 'mo',
    features: [
      '250 messages monthly',
      'Private projects',
      'Code editor',
      'History restore',
      'Chat support',
    ],
    productId: process.env.NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID,
    popular: true,
  },
  {
    name: 'Senior',
    price: 49.99,
    originalPrice: 90,
    period: 'mo',
    features: [
      '500 messages monthly',
      'Private projects',
      'Code editor',
      'History restore',
      'Chat support',
    ],
    productId: process.env.NEXT_PUBLIC_POLAR_SENIOR_PRODUCT_ID,
  },
]

export function SubscriptionModal({
  open,
  onOpenChange,
}: SubscriptionModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setIsLoadingStatus(true)
      // Fetch subscription status after modal opens
      getSubscriptionStatus()
        .then((data) => {
          setSubscriptionStatus(data)
        })
        .catch((error) => {
          console.error('[Subscription Modal] Failed to fetch subscription status:', error)
        })
        .finally(() => {
          setIsLoadingStatus(false)
        })
    }
  }, [open])

  const handleSubscribe = async (plan: Plan) => {
    posthog.capture('plan_selected', {
      plan_name: plan.name,
      plan_price: plan.price,
    })
    if (!plan.productId) {
      toast({
        title: 'Configuration Error',
        description: `Product ID for ${plan.name} plan is not configured. Please contact support.`,
        variant: 'destructive',
      })
      return
    }

    setLoadingPlan(plan.name)
    try {
      // Create checkout session with Polar
      const response = await fetch('/api/polar/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: plan.productId,
          planName: plan.name,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const { checkoutUrl } = await response.json()
      
      // Redirect to Polar checkout
      if (checkoutUrl) {
        window.location.href = checkoutUrl
      } else {
        throw new Error('No checkout URL received')
      }
    } catch (error) {
      console.error('Failed to start checkout:', error)
      toast({
        title: 'Subscription Error',
        description: 'Failed to start checkout process. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingPlan(null)
    }
  }

  const handleManageSubscription = async () => {
    // Open Polar portal in new tab
    window.open('https://polar.sh/capsule-app/portal', '_blank')
    // setLoadingPlan('manage')
    return
    try {
      // Use Better Auth Polar client to redirect to customer portal
      await authClient.customer.portal()
    } catch (error: any) {
      console.error('Failed to open customer portal:', error)
      
      // Provide more specific error messages
      let errorMessage = 'Failed to open customer portal. Please try again.'
      
      if (error?.error?.code === 'CUSTOMER_PORTAL_CREATION_FAILED') {
        errorMessage = 'Customer portal unavailable. You may need to purchase a subscription first.'
      } else if (error?.error?.message) {
        errorMessage = error.error.message
      }
      
      toast({
        title: 'Portal Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setLoadingPlan(null)
    }
  }

  // Show loading state while fetching
  if (isLoadingStatus) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Loading subscription details...</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Show manage account for existing subscribers (with any paid plan)
  if (subscriptionStatus?.hasSubscription) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center">
                Subscription Details 
              </DialogTitle>
              <DialogDescription className="text-center mt-2">
                You are currently on the{' '}
                <Badge variant="outline" className="capitalize">
                  {subscriptionStatus.currentPlan}
                </Badge>
                {' '}plan
              </DialogDescription>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogHeader>
            
            <div className="mt-6 space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Current Plan</span>
                  <span className="font-semibold capitalize">{subscriptionStatus.currentPlan}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Messages Used</span>
                  <span className="font-semibold">
                    {subscriptionStatus.messagesUsed} / {subscriptionStatus.messageLimit}
                  </span>
                </div>
                {subscriptionStatus.resetDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Resets</span>
                    <span className="font-semibold">
                      {new Date(subscriptionStatus.resetDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
              
              <Button 
                className="w-full"
                onClick={handleManageSubscription}
                disabled={loadingPlan === 'manage'}
              >
                {loadingPlan === 'manage' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Opening Portal...
                  </>
                ) : (
                  <>
                    <Settings className="h-4 w-4 mr-2" />
                    Manage Subscription
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center">
              {isLoadingStatus ? 'Loading...' : 'Choose Your Plan'}
            </DialogTitle>
            <div className="text-center mt-2 bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground">
              <span className="font-semibold">Announcement: </span>
              We have halved plan prices ✂️🥳 . React Native Vibe Code is now the most affordable vibe coding platform to create React Native apps. We will keep pushing to make the project the most open and affordable option to easily vibe code React Rative apps. Enjoy.
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogHeader>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'relative rounded-lg border p-6 transition-all hover:shadow-lg',
                  plan.popular
                    ? 'border-primary shadow-md scale-105'
                    : 'border-border',
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold">
                      POPULAR
                    </span>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    <div className="mt-2 flex items-baseline">
                      <span className="text-3xl font-bold">${plan.price}</span>
                      <span className="text-muted-foreground ml-1">
                        /{plan.period}
                      </span>
                    </div>
                    <span className="text-2xl text-muted-foreground line-through">
                      ${plan.originalPrice}/{plan.period}
                    </span>
                  </div>
                  
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button
                    className={cn(
                      'w-full',
                      plan.popular
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                        : '',
                    )}
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => handleSubscribe(plan)}
                    disabled={loadingPlan !== null}
                  >
                    {loadingPlan === plan.name ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Crown className="h-4 w-4 mr-2" />
                        {plan.name === 'Start' ? 'Get Started' : `Upgrade to ${plan.name}`}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 text-center">
            {/* {subscriptionStatus && !subscriptionStatus.hasSubscription && (
              <Button
                variant="link"
                className="text-sm text-muted-foreground"
                onClick={handleManageSubscription}
              >
                Already subscribed? Access your account
              </Button>
            )} */}
            <p className="mt-8 text-sm text-muted-foreground">Note: Messages reset each month on 1st of the month.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}