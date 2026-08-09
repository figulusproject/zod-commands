interface UsageFlag {
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

// Auto-generated default for cli.usage; override via defineCli({ usage: "..." }).
export function buildUsage(
  resolved: UsageFlag[],
  positionalsLabel?: string,
): string {
  const parts = resolved.map(({ long, descriptor, isBoolean, isOptional }) => {
    const alias = descriptor.short
      ? `--${long}/-${descriptor.short}`
      : `--${long}`;

    let core: string;
    if (descriptor.negatable) {
      core = `--${long}|--no-${long}`;
    } else if (isBoolean) {
      core = alias;
    } else {
      const placeholder = descriptor.placeholder ?? "value";
      const value = descriptor.multiple
        ? `<${placeholder}>...`
        : `<${placeholder}>`;
      core = `${alias} ${value}`;
    }

    return isOptional || descriptor.negatable ? `[${core}]` : core;
  });
  const allParts = positionalsLabel ? [positionalsLabel, ...parts] : parts;
  return `Usage: ${allParts.join(" ")}`;
}
