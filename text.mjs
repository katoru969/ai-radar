import * as cheerio from 'cheerio';
import {compact} from './articles.mjs';

export function plainText(input) {
  const $ = cheerio.load(String(input || ''),{},false);
  $('script,style').remove();
  $('br,p,div,li,h1,h2,h3').after(' ');
  return compact($.root().text(),5000);
}
