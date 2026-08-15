interface UsageFlag {
  key: string;
  long: string;
  descriptor: {
    short?: string;
    multiple?: boolean;
    negatable?: boolean;
    description?: string;
    placeholder?: string;
  };
  isBoolean: boolean;
  isOptional: boolean;
}

interface UsageGroup {
  keys: string[];
  required?: boolean;
}

function flagCore(flag: UsageFlag): string {
  const { long, descriptor, isBoolean } = flag;
  const alias = descriptor.short
    ? `--${long}/-${descriptor.short}`
    : `--${long}`;

  if (descriptor.negatable) return `--${long}|--no-${long}`;
  if (isBoolean) return alias;

  const placeholder = descriptor.placeholder ?? "value";
  const value = descriptor.multiple
    ? `<${placeholder}>...`
    : `<${placeholder}>`;
  return `${alias} ${value}`;
}

// Auto-generated default for cli.usage; override via defineCli({ usage: "..." }).
export function buildUsage(
  resolved: UsageFlag[],
  positionalsLabel?: string,
  groups: UsageGroup[] = [],
): string {
  const flagByKey = new Map(resolved.map((flag) => [flag.key, flag]));
  const groupByKey = new Map<string, UsageGroup>();
  for (const group of groups) {
    for (const key of group.keys) groupByKey.set(key, group);
  }

  const emittedGroups = new Set<UsageGroup>();
  const parts: string[] = [];
  for (const flag of resolved) {
    const group = groupByKey.get(flag.key);
    if (group) {
      if (emittedGroups.has(group)) continue;
      emittedGroups.add(group);
      const inner = group.keys
        .map((key) => flagCore(flagByKey.get(key)!))
        .join(" | ");
      parts.push(group.required ? `(${inner})` : `[${inner}]`);
      continue;
    }

    const core = flagCore(flag);
    parts.push(
      flag.isOptional || flag.descriptor.negatable ? `[${core}]` : core,
    );
  }

  const allParts = positionalsLabel ? [positionalsLabel, ...parts] : parts;
  return `Usage: ${allParts.join(" ")}`;
}
