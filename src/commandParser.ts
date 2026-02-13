export type ParsedPaletteCommand =
  | {
      kind: "add";
      text: string;
    }
  | {
      kind: "clear";
    }
  | {
      kind: "copy";
      index: number;
    }
  | {
      kind: "delete";
      index: number;
    }
  | {
      kind: "invalid";
      reason: string;
    };

type TokenizerState = {
  currentToken: string;
  escaped: boolean;
  quote: "'" | '"' | null;
  tokens: string[];
};

const initialTokenizerState: TokenizerState = {
  currentToken: "",
  escaped: false,
  quote: null,
  tokens: []
};

const commitToken = (state: TokenizerState): TokenizerState =>
  state.currentToken.length === 0
    ? state
    : {
        ...state,
        tokens: [...state.tokens, state.currentToken],
        currentToken: ""
      };

const tokenizeCommandInput = (
  commandInput: string
): { ok: true; tokens: string[] } | { ok: false; reason: string } => {
  const nextState = commandInput.split("").reduce<TokenizerState>((state, character) => {
    if (state.escaped) {
      return {
        ...state,
        escaped: false,
        currentToken: `${state.currentToken}${character}`
      };
    }

    if (character === "\\") {
      return {
        ...state,
        escaped: true
      };
    }

    if (state.quote !== null) {
      if (character === state.quote) {
        return {
          ...state,
          quote: null
        };
      }

      return {
        ...state,
        currentToken: `${state.currentToken}${character}`
      };
    }

    if (character === "'" || character === '"') {
      return {
        ...state,
        quote: character
      };
    }

    if (/\s/.test(character)) {
      return commitToken(state);
    }

    return {
      ...state,
      currentToken: `${state.currentToken}${character}`
    };
  }, initialTokenizerState);

  if (nextState.escaped) {
    return {
      ok: false,
      reason: "Invalid command: trailing escape character."
    };
  }

  if (nextState.quote !== null) {
    return {
      ok: false,
      reason: "Invalid command: unterminated quoted text."
    };
  }

  const finalizedState = commitToken(nextState);
  return {
    ok: true,
    tokens: finalizedState.tokens
  };
};

const parseIndexToken = (indexToken: string): number | null => {
  const parsedIndex = Number(indexToken);
  if (!Number.isInteger(parsedIndex) || parsedIndex <= 0) {
    return null;
  }

  return parsedIndex;
};

export const parsePaletteCommand = (
  rawCommandInput: string
): ParsedPaletteCommand => {
  const normalizedCommandInput = rawCommandInput.trim();
  if (normalizedCommandInput.length === 0) {
    return {
      kind: "invalid",
      reason: "No command entered."
    };
  }

  const tokenizeResult = tokenizeCommandInput(normalizedCommandInput);
  if (!tokenizeResult.ok) {
    return {
      kind: "invalid",
      reason: tokenizeResult.reason
    };
  }

  const [rawCommandName, ...rawArguments] = tokenizeResult.tokens;
  const commandName = rawCommandName?.toLowerCase() ?? "";

  if (commandName === "clear" && rawArguments.length === 0) {
    return { kind: "clear" };
  }

  if (commandName === "copy" || commandName === "delete") {
    if (rawArguments.length !== 1) {
      return {
        kind: "invalid",
        reason: `Invalid ${commandName} command. Usage: ${commandName} <index>`
      };
    }

    const parsedIndex = parseIndexToken(rawArguments[0] ?? "");
    if (parsedIndex === null) {
      return {
        kind: "invalid",
        reason: `Invalid ${commandName} index. Use a positive integer.`
      };
    }

    return commandName === "copy"
      ? { kind: "copy", index: parsedIndex }
      : { kind: "delete", index: parsedIndex };
  }

  if (commandName === "add") {
    const noteText = rawArguments.join(" ").trim();
    if (noteText.length === 0) {
      return {
        kind: "invalid",
        reason: "Invalid add command. Usage: add <text>"
      };
    }

    return {
      kind: "add",
      text: noteText
    };
  }

  return {
    kind: "invalid",
    reason: `Unknown command: ${rawCommandInput}`
  };
};
