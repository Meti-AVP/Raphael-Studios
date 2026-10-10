// A WhatsApp message to the studio, ready to send: the number is the one in content/site.ts (Base.astro puts it on
// the page's root element), so it is changed in one place.
export const whatsapp = (text: string) => `https://wa.me/${document.documentElement.dataset.wa ?? ''}?text=${encodeURIComponent(text)}`;
