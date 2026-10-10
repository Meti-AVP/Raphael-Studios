// The work's captions: who it was for, and what it is (from the picture's own description, media.generated.json).
import { media } from './media';

// the studio's clients as they are named in the descriptions (the earliest one in a description is its client)
const CLIENTS = [
  'North Coast Summer Remix',
  'Grand Egyptian Museum',
  'Castello di Trevi',
  'TotalEnergies',
  'Concentrix',
  'Doctor Clean',
  'Marie Louis',
  'Wellwoman',
  'Gran Tira',
  'Heineken',
  'Drinkies',
  'Acapella',
  'Crystal',
  'Rivoli',
  'Orange',
  'IQOS',
  'Dosh',
  'Oxi',
  'MPG',
  'Sol',
  'Raphael Studios',
];

export interface Caption {
  client: string;
  text: string;
}

export function caption(id: string): Caption {
  const alt = media(id).alt;
  let client = 'Raphael Studios';
  let at = Infinity;
  for (const c of CLIENTS) {
    const i = alt.search(new RegExp(`\b${c.replace(/ /g, '\s')}\b`));
    if (i >= 0 && i < at) {
      at = i;
      client = c;
    }
  }
  // "Client: what it is" keeps only what it is
  let text = alt;
  const colon = alt.indexOf(': ');
  if (colon > 0 && alt.slice(0, colon).includes(client)) text = alt.slice(colon + 2);
  return { client, text: text.charAt(0).toUpperCase() + text.slice(1) };
}
