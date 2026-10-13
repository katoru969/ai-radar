// Parses only the public transcript response, never recommended videos or comments.
export function transcriptPanelSegments(data) {
  const rows=[];
  const textOf=value=>typeof value==='string' ? value : value?.content || value?.simpleText || value?.runs?.map(run=>run.text || '').join('') || '';
  function visit(node,depth=0) {
    if (!node || typeof node!=='object' || depth>50 || rows.length>=5000) return;
    const segment=node.transcriptSegmentRenderer || node.transcriptSegmentViewModel;
    if (segment) {
      const startSeconds=Number(segment.startMs)/1000,text=textOf(segment.snippet || segment.text);
      if (Number.isFinite(startSeconds) && startSeconds>=0 && startSeconds<=21600 && /[ぁ-んァ-ヶ一-龯]/u.test(text)) rows.push({startSeconds:Math.floor(startSeconds),text:text.replace(/\[(?:音楽|拍手|笑い)\]|\s+/gu,'').slice(0,500)});
      return;
    }
    for (const value of Object.values(node)) visit(value,depth+1);
  }
  visit(data);
  return rows.filter(row=>row.text).sort((a,b)=>a.startSeconds-b.startSeconds);
}
