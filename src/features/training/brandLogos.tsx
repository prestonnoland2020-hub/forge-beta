import coros from '../../assets/brands/coros.svg';
import fitbit from '../../assets/brands/fitbit.svg';
import garmin from '../../assets/brands/garmin.svg';
import oura from '../../assets/brands/oura.svg';
import polar from '../../assets/brands/polar.svg';
import samsung from '../../assets/brands/samsung.svg';
import strava from '../../assets/brands/strava.svg';
import suunto from '../../assets/brands/suunto.svg';
import wahoo from '../../assets/brands/wahoo.svg';
import whoop from '../../assets/brands/whoop.svg';

/* THE PROVIDERS' OWN MARKS, SO AN ATHLETE RECOGNISES THEIR WATCH AT A GLANCE.
   Each file in src/assets/brands is the brand's published artwork, bundled
   (never hotlinked) and drawn in its own colours: Strava, Garmin, Fitbit and
   Samsung from Simple Icons v16.36.0 (CC0) with each brand's hex; WHOOP,
   Polar and Suunto from their Wikimedia Commons originals; Oura, Wahoo and
   the COROS hexagon from each company's own site. Garmin and Samsung keep the
   viewBox cropped to the wordmark so they fill the tile. Every mark sits on
   the same white tile — the ground all of them were drawn for — so none is
   recoloured for the dark theme.

   Apple Watch, Apple Health, Health Connect and Withings keep a neutral
   initials tile: Apple's rules bar its logo in third-party apps (the Apple
   Health icon ships from Apple's kit with the HealthKit build), and Google's
   Health Connect and Withings' current marks come with their partner kits. */

const logos: Record<string, string> = { strava, garmin, fitbit, samsung, whoop, oura, polar, coros, suunto, wahoo };

const initials = (name: string) => name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();

export function BrandMark({ id, name }: { id: string; name: string }) {
  const src = logos[id];
  if (!src) return <span className="provider-mark provider-mark-plain" aria-hidden="true">{initials(name)}</span>;
  return <span className="provider-mark" aria-hidden="true"><img src={src} alt="" draggable={false} /></span>;
}
