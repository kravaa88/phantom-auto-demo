import { shop } from './config.js';

const select = (id) => document.getElementById(id);
const form = select('book-form');
const grid = select('service-grid');
const dialog = select('detail');
const services = new Map(shop.services.map(([id, title, part, copy]) => [id, { title, part, copy }]));

function openService(id) {
  const service = services.get(id);
  select('detail-title').textContent = service.title;
  select('detail-copy').textContent = service.copy;
  select('detail-book').onclick = () => {
    form.elements.service.value = id;
    dialog.close();
    requestAnimationFrame(() => form.elements.service.focus({ preventScroll: true }));
  };
  dialog.showModal();
}
dialog.querySelector('.close').onclick = () => dialog.close();
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

for (const [id, service] of services) {
  const button = document.createElement('button');
  const title = document.createElement('strong');
  const copy = document.createElement('span');
  title.textContent = service.title;
  copy.textContent = service.copy;
  button.append(title, copy);
  button.onclick = () => openService(id);
  grid.append(button);
  form.elements.service.add(new Option(service.title, id));
}

document.querySelectorAll('[data-brand]').forEach((element) => { element.textContent = shop.name; });
if (shop.logo) document.querySelectorAll('[data-logo]').forEach((element) => { element.src = shop.logo; });
document.documentElement.style.setProperty('--accent', shop.accent);
document.documentElement.style.setProperty('--base', shop.surface);
select('address').textContent = shop.address;
select('location-note').hidden = shop.verified;
const query = encodeURIComponent(shop.address);
select('directions').href = 'https://www.google.com/maps/dir/?api=1&destination=' + query;
select('load-map').onclick = () => {
  const frame = document.createElement('iframe');
  frame.title = 'Google Maps — ' + shop.address;
  frame.src = 'https://maps.google.com/maps?output=embed&q=' + query;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  select('map').replaceChildren(frame);
};
if (shop.verified && shop.phone) {
  const link = document.createElement('a');
  link.className = 'button';
  link.textContent = 'Call Now';
  link.href = 'tel:' + shop.phone.replace(/[^+\d]/g, '');
  select('call').replaceWith(link);
  select('phone-note').textContent = shop.phone;
}
if (shop.verified && shop.reviewsUrl) {
  select('reviews-note').textContent = 'See customer feedback on our Google Business Profile.';
  const link = select('reviews-link');
  link.href = shop.reviewsUrl;
  link.hidden = false;
}

const now = new Date();
form.elements.date.min = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const canBook = Boolean(shop.verified && shop.bookingEndpoint);
const submit = select('submit-book');
submit.disabled = !canBook;
if (canBook) select('booking-note').textContent = 'Send your preferred date. The shop will follow up to confirm availability.';
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canBook) return;
  submit.disabled = true;
  const result = select('booking-result');
  result.textContent = 'Sending request…';
  try {
    const response = await fetch(shop.bookingEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    if (!response.ok || (await response.json()).accepted !== true) throw new Error('Booking not accepted');
    result.textContent = 'Request received. The shop will confirm availability separately.';
    form.reset();
  } catch {
    result.textContent = 'The request could not be sent. Please try again.';
  } finally {
    submit.disabled = false;
  }
});

function showFallback(error) {
  console.error(error);
  select('poster').hidden = false;
  select('car').hidden = true;
  select('markers').hidden = true;
  select('turn-left').disabled = true;
  select('turn-right').disabled = true;
  select('load-state').hidden = false;
  select('load-state').textContent = '3D unavailable on this device. Explore workshop services below.';
}

import('./viewer.js').then(({ initViewer }) => initViewer(services, openService, showFallback)).catch(showFallback);
