/**
 * Markdown内のコードブロックを圧縮
 */
export function compressCodeBlocks(markdown: string): string {
  return markdown.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
    const lines = code.trim().split('\n');

    // 15行以下ならそのまま
    if (lines.length <= 15) {
      return match;
    }

    // 重要行を抽出
    const important = [
      ...lines.slice(0, 8), // 最初8行
      `// ... (${lines.length - 13}行省略)`,
      ...lines.slice(-5) // 最後5行
    ];

    return `\`\`\`${lang || ''}\n${important.join('\n')}\n\`\`\``;
  });
}

/**
 * 記事を評価用に圧縮（バッチ評価用）
 */
export function compressForEvaluation(article: { id: string; title: string; body: string; tags: Array<{ name: string }> }): string {
  // コードブロックを圧縮
  let compressed = compressCodeBlocks(article.body);

  // 画像を簡略化
  compressed = compressed.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[画像: $1]');

  // 最初200文字 + タグ情報
  const preview = compressed.slice(0, 200);
  const tags = article.tags.map(t => t.name).join(', ');

  return `[${article.id}] ${article.title}\nタグ: ${tags}\n\n${preview}${compressed.length > 200 ? '...' : ''}`;
}

/**
 * 記事を投稿文生成用に最適化
 */
export function optimizeForSummarization(article: { title: string; body: string }): string {
  // コードブロックを圧縮
  let optimized = compressCodeBlocks(article.body);

  // 画像を簡略化
  optimized = optimized.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[画像: $1]');

  // 見出しと重要セクションを抽出
  const lines = optimized.split('\n');
  const importantLines: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // コードブロックの開始/終了を追跡
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    // 見出し、リスト、コードブロックは保持
    if (line.match(/^#+\s/) || line.match(/^[-*]\s/) || inCodeBlock || line.startsWith('```')) {
      importantLines.push(line);
    } else if (line.trim().length > 0) {
      // 通常のテキスト行は最初の50文字のみ保持
      importantLines.push(line.slice(0, 50) + (line.length > 50 ? '...' : ''));
    }
  }

  // 3000文字に制限
  const result = importantLines.join('\n');
  return result.length > 3000 ? result.slice(0, 3000) + '...' : result;
}

/**
 * テキストのバイトサイズを計算
 */
export function getByteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}
