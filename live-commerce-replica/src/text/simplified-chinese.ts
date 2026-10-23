import { Converter } from 'opencc-js/t2cn';

const convertTraditionalToSimplified = Converter({ from: 't', to: 'cn' });

export function simplifyChinese(text: string): string {
  return convertTraditionalToSimplified(text);
}
