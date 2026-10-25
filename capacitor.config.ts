import type { CapacitorConfig } from '@capacitor/cli';

/* THE NATIVE SHELL.

   Forge is a React app, and the iOS build is that same app running in a
   Capacitor WebView rather than a rewrite. What the native wrapper actually
   buys us is the three things a PWA cannot have on iOS: an App Store listing,
   StoreKit for the subscription (Guideline 3.1.1 leaves no alternative), and
   real haptics on the weight dial.

   `webDir` is Vite's build output. Run `npm run build` before `npx cap sync`,
   or the shell ships the previous bundle. */
const config: CapacitorConfig = {
  appId: 'com.forgetraining.forge',
  appName: 'Forge',
  webDir: 'dist',

  ios: {
    /* The app is dark. Without this the WebView flashes white between the
       splash screen and first paint, which reads as a broken launch. */
    backgroundColor: '#0b100e',
    /* 'never': the page draws under the status bar and home indicator and
       pads itself with env(safe-area-inset-*), which every screen already
       does. 'always' made iOS add its own inset on top, and with the keyboard
       resizing the page as well the content came back from a keyboard pushed
       down under a dark strip and stayed there. */
    contentInset: 'never',
    /* Bounce-scrolling past the top of a fixed app chrome exposes the
       WebView's own background and looks like the app came apart. */
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },

  android: {
    backgroundColor: '#0b100e',
  },

  server: {
    /* Supabase auth and Strava's OAuth return to https URLs, so the WebView
       has to treat them as navigations it is allowed to make rather than
       external links it hands to Safari. */
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0b100e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashImmersive: false,
    },
    Keyboard: {
      /* `native` resizes the WebView itself, so the page is simply shorter
         while the keyboard is up and exactly its old size after. `body` moved
         the document instead, which is what left screens shifted. */
      resize: 'native',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      /* The starting style only; features/shell/nativeChrome sets dark or
         light text from the theme as soon as the app runs. */
      style: 'DEFAULT',
      backgroundColor: '#0b100e',
    },
  },
};

export default config;
