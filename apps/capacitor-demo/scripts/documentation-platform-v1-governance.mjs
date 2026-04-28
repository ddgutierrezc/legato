const AUDIENCE_PATTERN = /^Audience:\s*(Public|Maintainer|Archive\/Evidence)\s*$/gim;
const CANONICAL_REDIRECT_PATTERN = /(Canonical docs-site page:|redirect(ed)? to).*(apps\/docs-site\/src\/content\/docs\/|\/docs\/)/im;

export function evaluateAudienceClassification(content) {
  const matches = [...content.matchAll(AUDIENCE_PATTERN)];
  const audiences = [...new Set(matches.map((match) => match[1]))].sort();

  if (audiences.length === 0) {
    return {
      status: 'unclassified',
      audiences,
      reason: 'Document must declare one audience: Public, Maintainer, or Archive/Evidence.',
    };
  }

  if (audiences.length > 1) {
    return {
      status: 'reject-mixed-content',
      audiences,
      reason: 'Document mixes audiences and must be split or rewritten before public publication.',
    };
  }

  return {
    status: 'classified',
    audiences,
    reason: 'Single audience classification is valid.',
  };
}

export function findLegacyPublicDocsWithoutCanonicalRedirect(documents) {
  return documents
    .filter(({ relativePath, content }) => {
      if (!relativePath.startsWith('docs/')) return false;

      const classification = evaluateAudienceClassification(content);
      if (!(classification.status === 'classified' && classification.audiences[0] === 'Public')) {
        return false;
      }

      return !CANONICAL_REDIRECT_PATTERN.test(content);
    })
    .map(({ relativePath }) => ({
      relativePath,
      reason: 'Public root docs topics must be migrated or redirected to a docs-site canonical page.',
    }));
}
