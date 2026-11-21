/**
 * Which environment this code runs in, taken from Netlify's own deploy context rather than from a variable someone
 * sets, so a production deploy can never claim to be staging. Netlify gives the context to the build as CONTEXT and to
 * functions as `context.deploy.context` (CONTEXT isn't available to functions at runtime); both can be
 * `production`, `branch-deploy`, `deploy-preview` or `dev`, and none at all for a plain local run.
 *
 *   production  the live site (`main`). No orders until the code has a live mode; no test account.
 *   staging     branch deploys (the `staging` branch). Orders with sandbox credentials; the test account.
 *   preview     pull-request deploy previews. No orders, so a preview can't send orders to a store's staff.
 *   development a local run. Orders only through the local mock store (STORE_CHECKOUT_MOCK=1).
 *
 * Credentials keep one name in every environment, with a different value per deploy context in Netlify.
 * Pure (no import.meta), so the build, the functions and the app can all use it.
 */
export type AppEnvironment = 'production' | 'staging' | 'preview' | 'development'

export function environmentFromContext(context: string | undefined): AppEnvironment {
  if (context === 'production') return 'production'
  if (context === 'branch-deploy') return 'staging'
  if (context === 'deploy-preview') return 'preview'
  return 'development'
}

/** Whether orders may be placed here at all. Production waits for a live mode, which is a code change. */
export function ordersAllowed(environment: AppEnvironment): boolean {
  return environment === 'staging' || environment === 'development'
}
