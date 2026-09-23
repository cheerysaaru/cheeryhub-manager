const corrections: Record<string, string> = {
  adn: 'and', becuase: 'because', dont: "don't", doesnt: "doesn't",
  didnt: "didn't", teh: 'the', thier: 'their', recieve: 'receive',
  seperate: 'separate', acheive: 'achieve', completly: 'completely',
  imporant: 'important', tommorow: 'tomorrow', calender: 'calendar',
  grammer: 'grammar', commitmnet: 'commitment',
};

export function correctTypos(value: string): string {
  return value.replace(/\b([A-Za-z']+)(\s+)/g, (match, word: string, spacing: string) => `${corrections[word.toLowerCase()] ?? word}${spacing}`);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}