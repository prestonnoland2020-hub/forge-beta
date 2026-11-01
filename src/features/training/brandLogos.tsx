import coros from '../../assets/brands/coros.png';
import fitbit from '../../assets/brands/fitbit.png';
import garmin from '../../assets/brands/garmin.png';
import garminDark from '../../assets/brands/garmin-dark.png';
import oura from '../../assets/brands/oura.png';
import ouraDark from '../../assets/brands/oura-dark.png';
import polar from '../../assets/brands/polar.png';
import polarDark from '../../assets/brands/polar-dark.png';
import samsung from '../../assets/brands/samsung.png';
import samsungDark from '../../assets/brands/samsung-dark.png';
import strava from '../../assets/brands/strava.png';
import suunto from '../../assets/brands/suunto.png';
import suuntoDark from '../../assets/brands/suunto-dark.png';
import wahoo from '../../assets/brands/wahoo.png';
import wahooDark from '../../assets/brands/wahoo-dark.png';
import whoop from '../../assets/brands/whoop.png';
import whoopDark from '../../assets/brands/whoop-dark.png';

/* THE PROVIDERS' OWN LOGOS, SITTING IN THE ROW THE WAY THEY DO ON THE
   BRANDS' OWN PAGES, SO AN ATHLETE RECOGNISES THEIR WATCH AT A GLANCE.
   Each PNG in src/assets/brands is the brand's published artwork rendered on
   a transparent ground at 3× the 76×24 slot, so it stays sharp on iPhone:
   Strava, Garmin, Fitbit and Samsung from Simple Icons v16.36.0 (CC0) in
   each brand's hex; WHOOP, Polar and Suunto from their Wikimedia Commons
   originals; Oura, Wahoo and the COROS hexagon from each company's own site.

   A logo drawn in black (or Samsung's navy) would vanish on the dark theme,
   so those brands also carry their reversed, white variant (`dark`), the
   one each brand uses on dark grounds; app-polish.css shows whichever
   matches the theme. Strava orange, Fitbit teal and COROS red read on both.

   Apple Watch, Apple Health, Health Connect and Withings show their initials
   in the logo slot instead: Apple's rules bar its logo in third-party apps
   (the Apple Health icon ships from Apple's kit with the HealthKit build), and
   Google's Health Connect and Withings' current marks come with their
   partner kits. */

type BrandLogo = { light: string; dark?: string };

const logos: Record<string, BrandLogo> = {
  strava: { light: strava }, fitbit: { light: fitbit }, coros: { light: coros },
  garmin: { light: garmin, dark: garminDark }, samsung: { light: samsung, dark: samsungDark }, whoop: { light: whoop, dark: whoopDark },
  oura: { light: oura, dark: ouraDark }, polar: { light: polar, dark: polarDark }, suunto: { light: suunto, dark: suuntoDark }, wahoo: { light: wahoo, dark: wahooDark },
};

const initials = (name: string) => name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();

export function BrandMark({ id, name }: { id: string; name: string }) {
  const logo = logos[id];
  if (!logo) return <span className="provider-logo provider-logo-plain" aria-hidden="true">{initials(name)}</span>;
  return <span className="provider-logo" aria-hidden="true">{logo.dark ? <><img className="logo-on-light" src={logo.light} alt="" draggable={false} /><img className="logo-on-dark" src={logo.dark} alt="" draggable={false} /></> : <img src={logo.light} alt="" draggable={false} />}</span>;
}
