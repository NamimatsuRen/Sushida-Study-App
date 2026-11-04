const names = { egg: 'たまご', cucumber: 'かっぱ巻き', shrimp: 'えび', tuna: 'まぐろ', salmon: 'サーモン', eel: 'うなぎ' };
const colors = ['#b7b9a5', '#48845e', '#578ab0', '#bb5b50', '#aa76a4', '#ba953f'];
function nigiri(type, x, y) {
  const toppings = {
    tuna: '<path d="M-47-16Q-32-35 30-30L48-10 43 4Q1 14-46 6Z" fill="#c73c3b"/><path d="M-30-23l20 27m-1-32L10 5m0-32L31 2" stroke="#ed7270" stroke-width="3" fill="none"/>',
    salmon: '<path d="M-47-16Q-32-35 30-30L48-10 43 4Q1 14-46 6Z" fill="#ed8659"/><path d="M-33-23l20 29m-4-35L5 7m-1-35L26 4m-2-30L43-7" stroke="#ffcc99" stroke-width="6" fill="none"/>',
    egg: '<path d="M-42-25L32-28 46-10 38 9-45 7Z" fill="#f4c842"/><path d="M-42-25L-45-13 39-14 46-10 32-28Z" fill="#ffdf72"/><path d="M-9-27L9-28 14 9 11 30-6 29-7 6Z" fill="#344c35"/>',
    eel: '<path d="M-46-18Q-12-38 36-27L48-5 39 7-44 9Z" fill="#955132"/><path d="M-32-22L-24 4m9-31L-6 7m10-34L14 6m9-30L33 2" stroke="#d79b55" stroke-width="6"/><path d="M-42-4Q3 2 42-6" stroke="#663820" stroke-width="4" fill="none"/>',
    shrimp: '<path d="M-44-7Q-37-30-5-30 22-29 32-13L46-19 57-11 44-2 51 6 33 9Q9-1-12 8L-41 7Z" fill="#f2946c"/><path d="M-30-23L-24 4m9-32L-9 4m9-30L7 3m7-23L21 2" stroke="#fff0d0" stroke-width="7"/><path d="M40-10l12-9m-10 17 14 4" stroke="#d55d3e" stroke-width="3"/>',
  };
  return `<g transform="translate(${x} ${y}) rotate(-12)"><path d="M-44-7Q-43-20-25-21L26-21Q46-20 45-2L39 21Q-1 39-42 19Z" fill="#fffcef" stroke="#ddd6bd" stroke-width="1.5"/><path d="M-32 11l6 4m11 5 6 2m12-9 5 3m12 0 6 1m-42-10 5 3" stroke="#dedbc8" stroke-width="2.5" stroke-linecap="round"/>${toppings[type] || toppings.tuna}</g>`;
}
export function sushi(type = 'salmon', tier = 0) {
  const filling = type === 'cucumber' ? [0, 1, 2].map(i => `<g transform="translate(${88+i*36} ${75+(i%2)*12})"><path d="M-19 0v31Q0 49 20 30V0Z" fill="#263d2d"/><ellipse rx="20" ry="13" fill="#fbf9e9" stroke="#263d2d" stroke-width="4"/><ellipse rx="9" ry="6" fill="#729c48"/><path d="M-4-3L4 3" stroke="#c1d47f" stroke-width="3"/></g>`).join('') : nigiri(type, 95, 83) + nigiri(type, 156, 67);
  return `<svg class="sushi-art" viewBox="0 0 250 170" role="img" aria-label="${names[type] || names.salmon}"><ellipse cx="125" cy="136" rx="104" ry="19" fill="#000" opacity=".12"/><path d="M17 108v10Q125 181 233 118v-10" fill="${colors[tier % 6]}"/><ellipse cx="125" cy="107" rx="108" ry="42" fill="#f4f0de" stroke="${colors[tier % 6]}" stroke-width="8"/><ellipse cx="125" cy="107" rx="89" ry="31" fill="#e8e2c9" stroke="#fff9e8" stroke-width="3"/>${filling}</svg>`;
}
