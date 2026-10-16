// Unmodified, locally bundled Phosphor regular icons. See icons/LICENSE.
export const ICON_NAMES = ['house','magnifying-glass','book-open','gear-six','bookmark-simple','check','caret-right','caret-left','caret-down','arrow-up-right','arrows-clockwise','x','text-align-left','user','question','list-bullets','info','warning-circle'];
export const ICON_FILES = ICON_NAMES.map(name => `icons/${name}.svg`);
export function icon(name,className = '') {
  if (!ICON_NAMES.includes(name)) return '';
  return `<img class="ui-icon ${className}" src="./icons/${name}.svg" alt="" aria-hidden="true" width="24" height="24">`;
}
