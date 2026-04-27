import { readFile, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = resolve(scriptDir, '..');
const requireFromScript = createRequire(import.meta.url);
const VALID_PROFILES = new Set(['capacitor', 'contract']);
const typescriptRuntimeCache = new Map();

const collectTypeScriptCandidateRoots = ({ packageRoot } = {}) => {
  const candidates = [
    packageRoot,
    defaultPackageRoot,
    process.cwd(),
    scriptDir,
  ]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => resolve(value));
  return [...new Set(candidates)];
};

const resolveTypeScriptModulePath = ({ packageRoot } = {}) => {
  const candidateRoots = collectTypeScriptCandidateRoots({ packageRoot });
  for (const candidateRoot of candidateRoots) {
    try {
      const requireFromCandidate = createRequire(resolve(candidateRoot, 'package.json'));
      const modulePath = requireFromCandidate.resolve('typescript');
      if (modulePath) {
        return modulePath;
      }
    } catch {
      // Continue through fallback roots.
    }
  }

  try {
    return requireFromScript.resolve('typescript');
  } catch {
    const fallbackSummary = candidateRoots.length > 0
      ? candidateRoots.join(', ')
      : '<none>';
    throw new Error(`Unable to resolve TypeScript runtime. Tried package-root and fallbacks: ${fallbackSummary}`);
  }
};

export const resolveTypeScriptRuntime = ({ packageRoot } = {}) => {
  const modulePath = resolveTypeScriptModulePath({ packageRoot });
  if (!typescriptRuntimeCache.has(modulePath)) {
    const loadedModule = requireFromScript(modulePath);
    const tsRuntime = loadedModule?.default ?? loadedModule;
    typescriptRuntimeCache.set(modulePath, tsRuntime);
  }

  return {
    ts: typescriptRuntimeCache.get(modulePath),
    modulePath,
  };
};

const normalizeRelativePath = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '');

const collectStringValues = (value, into = []) => {
  if (typeof value === 'string') {
    into.push(value);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, into);
    }
    return into;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      collectStringValues(nested, into);
    }
  }
  return into;
};

const pathExists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const readPackageJson = async (packageRoot) => {
  const raw = await readFile(resolve(packageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw);
};

const isContractDeepExportKey = (key) => {
  const normalized = String(key ?? '').trim();
  return normalized.startsWith('./') && normalized !== './package.json';
};

const hasString = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizeKeyword = (value) => String(value ?? '').trim().toLowerCase();

const detectProfile = ({ profile, packageJson }) => {
  const explicit = String(profile ?? '').trim().toLowerCase();
  if (VALID_PROFILES.has(explicit)) {
    return explicit;
  }

  const packageName = String(packageJson?.name ?? '').toLowerCase();
  if (packageName.includes('legato-capacitor')) {
    return 'capacitor';
  }
  if (packageName.includes('legato-contract')) {
    return 'contract';
  }
  return null;
};

const mentionsLegatoCli = (readmeRaw) => /`?legato`?\s+native|\blegato\s+native\b/i.test(readmeRaw);

const createDefaultTypescriptCompilerOptions = (ts) => ({
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
  strict: false,
});

const DEFAULT_ALLOWED_EVIDENCE_KINDS = new Set([
  'signature',
  'implementation',
  'test',
  'maintainer-source-map',
]);

const createDeclarationKindSets = (ts) => ({
  functionLike: new Set([
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.MethodSignature,
  ]),
  typeLike: new Set([
    ts.SyntaxKind.InterfaceDeclaration,
    ts.SyntaxKind.TypeAliasDeclaration,
  ]),
  constantLike: new Set([
    ts.SyntaxKind.VariableDeclaration,
    ts.SyntaxKind.VariableStatement,
    ts.SyntaxKind.EnumDeclaration,
    ts.SyntaxKind.EnumMember,
  ]),
});

const toRelativeFromPackageRoot = (packageRoot, absolutePath) => normalizeRelativePath(absolutePath.slice(packageRoot.length + 1));

const normalizeCommentText = (comment) => {
  if (typeof comment === 'string') {
    return comment.trim();
  }
  if (Array.isArray(comment)) {
    return comment.map((piece) => String(piece.text ?? '')).join('').trim();
  }
  return '';
};

const resolveAliasedSymbol = (checker, symbol, ts) => {
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(symbol);
  }
  return symbol;
};

export const evaluateJsdocClaimEvidence = ({ packageName, claims = [], allowedEvidenceKinds } = {}) => {
  const allowedKinds = new Set(
    Array.isArray(allowedEvidenceKinds) && allowedEvidenceKinds.length > 0
      ? allowedEvidenceKinds.map((kind) => normalizeKeyword(kind))
      : [...DEFAULT_ALLOWED_EVIDENCE_KINDS],
  );
  const failures = [];

  for (const claimEntry of claims) {
    const normalizedClaim = String(claimEntry?.claim ?? '').trim();
    if (normalizedClaim.length === 0) {
      continue;
    }
    const evidences = Array.isArray(claimEntry?.evidence) ? claimEntry.evidence : [];
    const hasAllowedEvidence = evidences.some((evidenceEntry) => {
      const evidenceKind = normalizeKeyword(
        typeof evidenceEntry === 'string'
          ? evidenceEntry
          : evidenceEntry?.kind,
      );
      return allowedKinds.has(evidenceKind);
    });

    if (!hasAllowedEvidence) {
      failures.push({
        packageName,
        symbol: claimEntry?.symbol ?? '<unknown>',
        claim: normalizedClaim,
        missing: ['source-backed evidence'],
      });
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    packageName,
    failures,
  };
};

export const evaluateStageClosure = ({
  stageName,
  documentedSymbols,
  totalSymbols,
  scopedClosure,
} = {}) => {
  const failures = [];
  const documentedCount = Number(documentedSymbols ?? 0);
  const totalCount = Number(totalSymbols ?? 0);
  const stageLabel = String(stageName ?? 'unnamed-stage');

  if (documentedCount >= totalCount) {
    return {
      status: 'PASS',
      exitCode: 0,
      stageName: stageLabel,
      failures,
    };
  }

  if (!scopedClosure || typeof scopedClosure !== 'object') {
    failures.push(
      `Stage ${stageLabel} is partially complete (${documentedCount}/${totalCount}) and must declare scoped closure metadata.`,
    );
  } else {
    const scopedDocumented = Number(scopedClosure.documentedSymbols ?? NaN);
    const scopedTotal = Number(scopedClosure.totalSymbols ?? NaN);
    if (!Number.isFinite(scopedDocumented) || !Number.isFinite(scopedTotal)) {
      failures.push(`Stage ${stageLabel} scoped closure metadata must include numeric documentedSymbols/totalSymbols.`);
    } else if (scopedDocumented < scopedTotal) {
      failures.push(
        `Stage ${stageLabel} scoped closure is incomplete (${scopedDocumented}/${scopedTotal}).`,
      );
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    stageName: stageLabel,
    failures,
  };
};

const classifyExportCategory = (symbol, declarationKindSets) => {
  const declarations = symbol.getDeclarations() ?? [];
  const symbolName = symbol.getName();
  const hasKind = (set) => declarations.some((declaration) => set.has(declaration.kind));

  if (
    symbolName.endsWith('EventPayloadMap')
    || symbolName.endsWith('EventPayload')
    || symbolName.endsWith('EventName')
    || symbolName.endsWith('EVENT_NAMES')
  ) {
    return 'event maps/payload types';
  }
  if (hasKind(declarationKindSets.functionLike)) {
    return 'functions/methods';
  }
  if (hasKind(declarationKindSets.typeLike)) {
    return 'types/interfaces';
  }
  if (hasKind(declarationKindSets.constantLike)) {
    return 'constants/enums';
  }
  return 'types/interfaces';
};

const loadPackageCompilerOptions = (packageRoot, ts) => {
  const configPath = ts.findConfigFile(packageRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    return createDefaultTypescriptCompilerOptions(ts);
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return createDefaultTypescriptCompilerOptions(ts);
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath),
    undefined,
    configPath,
  );
  return {
    ...createDefaultTypescriptCompilerOptions(ts),
    ...parsed.options,
  };
};

const createCheckerForEntrypoint = (entrypointPath, packageRoot, ts) => {
  const program = ts.createProgram([entrypointPath], loadPackageCompilerOptions(packageRoot, ts));
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entrypointPath);
  if (!sourceFile) {
    throw new Error(`Unable to load TypeScript source file: ${entrypointPath}`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(`Unable to resolve module symbol for: ${entrypointPath}`);
  }
  return { checker, moduleSymbol };
};

export const collectRootExportInventory = async ({ packageRoot, sourceEntrypoint = 'src/index.ts' } = {}) => {
  const resolvedPackageRoot = resolve(packageRoot ?? defaultPackageRoot);
  const { ts } = resolveTypeScriptRuntime({ packageRoot: resolvedPackageRoot });
  const entrypointPath = resolve(resolvedPackageRoot, sourceEntrypoint);
  const { checker, moduleSymbol } = createCheckerForEntrypoint(entrypointPath, resolvedPackageRoot, ts);
  const declarationKindSets = createDeclarationKindSets(ts);
  const exports = checker.getExportsOfModule(moduleSymbol);

  return exports
    .map((symbol) => {
      const resolvedSymbol = resolveAliasedSymbol(checker, symbol, ts);
      const declaration = resolvedSymbol.getDeclarations()?.[0];
      return {
        symbol: symbol.getName(),
        category: classifyExportCategory(resolvedSymbol, declarationKindSets),
        sourceFile: declaration?.getSourceFile()?.fileName
          ? toRelativeFromPackageRoot(resolvedPackageRoot, declaration.getSourceFile().fileName)
          : undefined,
      };
    })
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
};

const getPrimaryDeclaration = (symbol, ts) => {
  const declarations = symbol.getDeclarations() ?? [];
  return declarations.find((declaration) => declaration.kind !== ts.SyntaxKind.ExportSpecifier) ?? declarations[0];
};

const getTagValues = (declaration, ts) => {
  const tags = ts.getJSDocTags(declaration);
  const paramTags = new Set();
  let hasReturns = false;

  for (const tag of tags) {
    const tagName = tag.tagName.getText();
    if (tagName === 'param' && tag.name && ts.isIdentifier(tag.name)) {
      paramTags.add(tag.name.text);
    }
    if (tagName === 'returns' || tagName === 'return') {
      hasReturns = true;
    }
  }

  return {
    paramTags,
    hasReturns,
  };
};

const declarationHasSummary = (checker, symbol, declaration, ts) => {
  const symbolSummary = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  if (symbolSummary.length > 0) {
    return true;
  }
  const jsdocNodes = ts.getJSDocCommentsAndTags(declaration).filter((node) => node.kind === ts.SyntaxKind.JSDoc);
  return jsdocNodes.some((node) => normalizeCommentText(node.comment).length > 0);
};

const declarationNeedsPropertyDocs = (symbol, category, declaration, ts) => {
  const name = symbol.getName();
  if (category === 'event maps/payload types') {
    return true;
  }
  if (name.endsWith('Options') || name.endsWith('PayloadMap')) {
    return true;
  }
  return ts.isInterfaceDeclaration(declaration) && declaration.members.length > 0 && name.endsWith('Snapshot');
};

const collectMissingPropertyDocs = (declaration, ts) => {
  if (!ts.isInterfaceDeclaration(declaration) && !ts.isTypeLiteralNode(declaration)) {
    return [];
  }

  const members = ts.isInterfaceDeclaration(declaration) ? declaration.members : declaration.members;
  const missing = [];

  for (const member of members) {
    if (!('name' in member) || !member.name) {
      continue;
    }
    const summaryNodes = ts.getJSDocCommentsAndTags(member).filter((node) => node.kind === ts.SyntaxKind.JSDoc);
    const hasSummary = summaryNodes.some((node) => normalizeCommentText(node.comment).length > 0);
    if (!hasSummary) {
      const memberName = member.name.getText();
      missing.push(`property ${memberName}`);
    }
  }

  return missing;
};

const resolveDeclarationSourceFromMap = async (declFilePath, packageRoot) => {
  const mapPaths = [
    `${declFilePath}.map`,
    resolve(packageRoot, 'dist/index.d.ts.map'),
  ];
  for (const mapPath of mapPaths) {
  try {
    const raw = await readFile(mapPath, 'utf8');
    const parsed = JSON.parse(raw);
    const source = Array.isArray(parsed.sources) ? parsed.sources.find((item) => hasString(item)) : undefined;
      if (source) {
        return source;
      }
  } catch {
      // Continue scanning fallback maps.
    }
  }
  return undefined;
};

export const validateDeclarationJsdocCoverage = async ({ packageRoot, profile } = {}) => {
  const resolvedPackageRoot = resolve(packageRoot ?? defaultPackageRoot);
  const { ts } = resolveTypeScriptRuntime({ packageRoot: resolvedPackageRoot });
  const sourceEntrypointPath = resolve(resolvedPackageRoot, 'src/index.ts');
  const declarationEntrypoint = resolve(resolvedPackageRoot, 'dist/index.d.ts');
  if (!await pathExists(sourceEntrypointPath) || !await pathExists(declarationEntrypoint)) {
    return {
      status: 'PASS',
      exitCode: 0,
      profile,
      packageRoot: resolvedPackageRoot,
      totalSymbols: 0,
      documentedSymbols: 0,
      failures: [],
      skipped: 'source-or-declaration-entrypoint-missing',
    };
  }

  const sourceInventory = await collectRootExportInventory({ packageRoot: resolvedPackageRoot });
  const { checker, moduleSymbol } = createCheckerForEntrypoint(declarationEntrypoint, resolvedPackageRoot, ts);
  const declarationExports = new Map(
    checker
      .getExportsOfModule(moduleSymbol)
      .map((symbol) => [symbol.getName(), resolveAliasedSymbol(checker, symbol, ts)]),
  );

  const failures = [];

  for (const inventoryEntry of sourceInventory) {
    const symbol = declarationExports.get(inventoryEntry.symbol);
    if (!symbol) {
      failures.push({
        packageName: profile,
        symbol: inventoryEntry.symbol,
        category: inventoryEntry.category,
        declFile: 'dist/index.d.ts',
        sourceFile: inventoryEntry.sourceFile,
        missing: ['declaration export'],
      });
      continue;
    }

    const declaration = getPrimaryDeclaration(symbol, ts);
    if (!declaration) {
      failures.push({
        packageName: profile,
        symbol: inventoryEntry.symbol,
        category: inventoryEntry.category,
        declFile: 'dist/index.d.ts',
        sourceFile: inventoryEntry.sourceFile,
        missing: ['declaration node'],
      });
      continue;
    }

    const missing = [];
    const hasSummary = declarationHasSummary(checker, symbol, declaration, ts);
    if (!hasSummary) {
      missing.push('summary');
    }

    if (inventoryEntry.category === 'functions/methods') {
      const { paramTags, hasReturns } = getTagValues(declaration, ts);
      const parameters = 'parameters' in declaration ? declaration.parameters : [];
      for (const parameter of parameters) {
        if (ts.isIdentifier(parameter.name) && !paramTags.has(parameter.name.text)) {
          missing.push(`@param ${parameter.name.text}`);
        }
      }
      const returnType = 'type' in declaration ? declaration.type : undefined;
      const hasVoidReturn = returnType?.kind === ts.SyntaxKind.VoidKeyword;
      if (!hasVoidReturn && parameters.length >= 0 && !hasReturns) {
        missing.push('@returns');
      }
    }

    if (declarationNeedsPropertyDocs(symbol, inventoryEntry.category, declaration, ts)) {
      missing.push(...collectMissingPropertyDocs(declaration, ts));
    }

    if (missing.length > 0) {
      const declarationFilePath = declaration.getSourceFile().fileName;
      const sourceFile = await resolveDeclarationSourceFromMap(declarationFilePath, resolvedPackageRoot);
      failures.push({
        packageName: profile,
        symbol: inventoryEntry.symbol,
        category: inventoryEntry.category,
        declFile: toRelativeFromPackageRoot(resolvedPackageRoot, declarationFilePath),
        sourceFile,
        missing,
      });
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    profile,
    packageRoot: resolvedPackageRoot,
    totalSymbols: sourceInventory.length,
    documentedSymbols: sourceInventory.length - failures.length,
    failures,
  };
};

export const validatePackageErgonomics = async ({ packageRoot, profile } = {}) => {
  const resolvedPackageRoot = resolve(packageRoot ?? defaultPackageRoot);
  const packageJson = await readPackageJson(resolvedPackageRoot);
  const resolvedProfile = detectProfile({ profile, packageJson });
  const failures = [];

  const requiredStringFields = ['description', 'homepage'];
  for (const field of requiredStringFields) {
    if (!hasString(packageJson[field])) {
      failures.push(`Metadata field is required: ${field}`);
    }
  }

  const repository = packageJson.repository;
  const repositoryValid = hasString(repository)
    || (repository && typeof repository === 'object' && hasString(repository.url));
  if (!repositoryValid) {
    failures.push('Metadata field is required: repository (string or object with url).');
  }

  const keywords = Array.isArray(packageJson.keywords) ? packageJson.keywords : [];
  if (keywords.length === 0) {
    failures.push('Metadata field is required: keywords (non-empty array).');
  }

  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  if (files.length === 0) {
    failures.push('Metadata field is required: files (non-empty array).');
  }

  const hasReadmeInFiles = files.some((entry) => normalizeRelativePath(String(entry)).toLowerCase() === 'readme.md');
  if (!hasReadmeInFiles) {
    failures.push('Published files must include README.md.');
  }

  const readmePath = resolve(resolvedPackageRoot, 'README.md');
  const readmeExists = await pathExists(readmePath);
  if (!readmeExists) {
    failures.push('README.md must exist at package root.');
  }

  const readmeRaw = readmeExists ? await readFile(readmePath, 'utf8') : '';
  const packageBin = packageJson.bin;
  const hasBin = Boolean(packageBin && typeof packageBin === 'object' && Object.keys(packageBin).length > 0);

  if (resolvedProfile === 'capacitor') {
    const normalizedKeywords = new Set(keywords.map((value) => normalizeKeyword(value)));
    for (const keyword of ['legato', 'capacitor']) {
      if (!normalizedKeywords.has(keyword)) {
        failures.push(`Capacitor profile keyword missing: ${keyword}`);
      }
    }

    const legatoBin = packageBin?.legato;
    if (!hasString(legatoBin)) {
      failures.push('Capacitor profile must declare bin.legato as a string path.');
    }

    if (!mentionsLegatoCli(readmeRaw)) {
      failures.push('Capacitor README must document the `legato` CLI scope.');
    }
  }

  if (resolvedProfile === 'contract') {
    const normalizedKeywords = new Set(keywords.map((value) => normalizeKeyword(value)));
    for (const keyword of ['legato', 'contract']) {
      if (!normalizedKeywords.has(keyword)) {
        failures.push(`Contract profile keyword missing: ${keyword}`);
      }
    }

    if (hasBin) {
      failures.push('Contract profile must not declare bin metadata.');
    }

    if (mentionsLegatoCli(readmeRaw)) {
      failures.push('Contract README/docs must not advertise `legato` CLI commands.');
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    packageName: packageJson.name,
    packageRoot: resolvedPackageRoot,
    profile: resolvedProfile,
    failures,
  };
};

export const collectDeclaredEntrypoints = (packageJson) => {
  const candidates = [
    packageJson.main,
    packageJson.types,
    packageJson.exports,
    packageJson.bin,
  ];
  const allValues = collectStringValues(candidates);
  return [...new Set(allValues.map((value) => normalizeRelativePath(value)))];
};

export const validatePackageEntrypoints = async ({ packageRoot, requireDistPrefix = true, profile } = {}) => {
  const resolvedPackageRoot = resolve(packageRoot ?? defaultPackageRoot);
  const packageJson = await readPackageJson(resolvedPackageRoot);
  const failures = [];
  const entrypoints = collectDeclaredEntrypoints(packageJson);
  const resolvedProfile = detectProfile({ profile, packageJson });

  if (entrypoints.length === 0) {
    failures.push('No publish-facing entrypoints declared (main/types/exports/bin are empty).');
  }

  for (const entry of entrypoints) {
    if (isAbsolute(entry) || entry.startsWith('..')) {
      failures.push(`Entrypoint must be package-relative (found: ${entry}).`);
      continue;
    }

    if (requireDistPrefix && !entry.startsWith('dist/')) {
      failures.push(`Entrypoint must resolve under dist/** (found: ${entry}).`);
      continue;
    }

    const targetPath = resolve(resolvedPackageRoot, entry);
    if (!await pathExists(targetPath)) {
      failures.push(`Entrypoint target does not exist: ${entry}`);
    }
  }

  if (resolvedProfile === 'contract') {
    const exportsField = packageJson.exports;
    if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
      failures.push('Contract profile must define exports as an object with root-only "exports[\".\"]".');
    } else {
      const exportKeys = Object.keys(exportsField);
      const hasRootExport = exportKeys.includes('.');
      if (!hasRootExport) {
        failures.push('Contract profile must define root-only "exports[\".\"]".');
      }
      for (const exportKey of exportKeys) {
        if (isContractDeepExportKey(exportKey)) {
          failures.push(`Contract profile must not expose deep subpath exports (found: exports["${exportKey}"]).`);
        }
      }
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  const ergonomics = await validatePackageErgonomics({ packageRoot: resolvedPackageRoot, profile });
  const jsdocCoverage = await validateDeclarationJsdocCoverage({ packageRoot: resolvedPackageRoot, profile: ergonomics.profile });
  const jsdocFailures = jsdocCoverage.failures.map((failure) => {
    const sourceSuffix = failure.sourceFile ? ` sourceFile=${failure.sourceFile}` : '';
    return `JSDoc coverage missing for ${failure.symbol} (${failure.category}) in ${failure.declFile}${sourceSuffix}: ${failure.missing.join(', ')}`;
  });
  const mergedFailures = [...failures, ...ergonomics.failures, ...jsdocFailures];
  const mergedStatus = mergedFailures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status: mergedStatus,
    exitCode: mergedStatus === 'PASS' ? 0 : 1,
    packageName: packageJson.name,
    packageRoot: resolvedPackageRoot,
    entrypoints,
    profile: ergonomics.profile,
    jsdocCoverage,
    failures: mergedFailures,
  };
};

const parseArgs = (argv) => {
  const options = {
    packageRoot: defaultPackageRoot,
    requireDistPrefix: true,
    profile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--package-root' && argv[i + 1]) {
      options.packageRoot = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--allow-non-dist') {
      options.requireDistPrefix = false;
      continue;
    }
    if (arg === '--profile' && argv[i + 1]) {
      options.profile = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const result = await validatePackageEntrypoints(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}
