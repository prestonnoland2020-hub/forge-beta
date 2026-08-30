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
    contentInset: 'always',
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
      /* `body` resizing keeps the workout log's inputs above the keyboard
         without the layout jumping, which matters most on the one screen
         holding unsaved work. */
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b100e',
    },
  },
};

export default config;
