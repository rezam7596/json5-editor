/* eslint-disable */
import Prism, { hooks, Environment, Token } from 'prismjs';

// 参考 1：https://prismjs.com/test.html#language=json5 // inspect element to check deps and its order
// 参考 2：https://prismjs.com/extending.html#resolving-dependencies
import 'prismjs/components/prism-markup.min.js';
import 'prismjs/components/prism-json.min.js';
import 'prismjs/components/prism-json5.min.js';
import { endList, startList } from '../constant';

const getInnerContent = (str: string) => {
  if (str.startsWith('"') || str.startsWith("'")) {
    return str.slice(1, str.length - 1);
  }
  return str;
};

interface EditorState {
  cache: string[];
  latestTokens: Token[];
}

const getLanguageAsSymbol = (env: hooks.RequiredEnvironment<'language', Environment>) => {
  return env.language as unknown as symbol;
};

const cacheTokens = (uid: symbol, tokens: Token[]) => {
  setTimeout(() => {
    // 如果已经被卸载了，则不重新缓存 tokens
    if (editorCacheMap.has(uid)) {
      editorCacheMap.set(uid, {
        cache: editorCacheMap.get(uid)?.cache || [],
        latestTokens: tokens,
      });
    }
  });
};

const resetTokens = (uid: symbol) => {
  if (editorCacheMap.has(uid)) {
    editorCacheMap.set(uid, {
      cache: [],
      latestTokens: [],
    });
  }
};

export const getTokens = (uid: symbol) => {
  return editorCacheMap.get(uid)?.latestTokens;
};

export const getTokenAtIndex = (uid: symbol, index: number) => {
  const tokens = getTokens(uid) || [];
  let remain = index;
  for (let token of tokens) {
    remain -= token.length;
    if (remain < 0) {
      return token;
    }
  }
  return undefined;
};

const editorCacheMap = new Map<symbol, EditorState>();

export function registerPlugin(uid: symbol) {
  editorCacheMap.set(uid, {
    cache: [],
    latestTokens: [],
  });

  // before-insert is a self registered hook that can determine first time registration
  if (!((Prism.hooks.all || {})['before-insert'] || []).length) {
    const nextPropertyRegex = [
      ...(Prism.languages.json5.property as {
        pattern: RegExp;
        alias?: string;
      }[]),
    ];
    // extends unquoted property to support * and ? at end.
    nextPropertyRegex[1] = {
      pattern: /(?!\s)[_$a-zA-Z\xA0-\uFFFF\*](?:(?!\s)[$\w\xA0-\uFFFF\*\?])*(?=\s*:)/,
      alias: 'unquoted',
    };
    Prism.languages.json5 = Prism.languages.extend('json5', {
      property: nextPropertyRegex,
      linebreak: /\r?\n/,
      // TODO: should skip non-leading spaces
      indent: /[ ]{2}/,
      // punctuation: /[{}[\],\|\(\)]/,
      seperator: /[{}[\]\|\(\)]/,
      unknown: /(?!\s).+(?=\s*)/,
    });

    Prism.hooks.add('after-tokenize', function (env) {
      resetTokens(getLanguageAsSymbol(env));
      let lastProperty: string | number | symbol = 'root';
      // 当遇到 array 时，插入一个 placeholder symbol，用于在 arrayPrefix 数组中找到真实的 index 后替换
      let prefix: Array<string | number | symbol> = [];
      let arrayPrefix: number[] = [];
      let symbol = Symbol('placeholder');

      cacheTokens(getLanguageAsSymbol(env), env.tokens);
      for (let i = 0; i < (env.tokens?.length || 0); i++) {
        if (env.tokens[i].content === '{') {
          prefix.push(lastProperty);
          lastProperty = '';
          // prefix.push(lastProperty);
        }
        if (env.tokens[i].content === '[') {
          prefix.push(lastProperty);
          arrayPrefix.push(0);
          prefix.push(symbol);
          lastProperty = '';
        }
        if (env.tokens[i].content === '}') {
          prefix.pop();
          lastProperty = prefix[prefix.length - 1];
          if (arrayPrefix.length && typeof lastProperty === 'symbol') {
            arrayPrefix[arrayPrefix.length - 1]++;
          }
          lastProperty = '';
        }
        if (env.tokens[i].content === ']') {
          prefix.pop();
          prefix.pop();
          arrayPrefix.pop();
          lastProperty = prefix[prefix.length - 1];
          if (arrayPrefix.length && typeof lastProperty === 'symbol') {
            arrayPrefix[arrayPrefix.length - 1]++;
          }
          lastProperty = '';
        }
        if (env.tokens[i].type === 'property') {
          lastProperty = getInnerContent(env.tokens[i].content);
          let arrayIndex = 0;
          env.tokens[i].alias = `${env.tokens[i].alias || ''} ${[...prefix, lastProperty]
            .filter((ele) => ele !== '')
            .map((ele) => (typeof ele === 'symbol' ? arrayPrefix[arrayIndex++] : ele))
            .join('.')}`.trim();
        }
      }
    });

    Prism.hooks.add('before-insert', (env) => {
      resetTokens(getLanguageAsSymbol(env));
    });

    // exist property
    Prism.hooks.add('wrap', (env) => {
      if (editorCacheMap.get(getLanguageAsSymbol(env))) {
        let { cache = [] } = editorCacheMap.get(getLanguageAsSymbol(env)) || {};
        if (env.type === 'property') {
          const extraClassList = (env.classes[2] || '').split(' ');
          const objectPath = extraClassList[extraClassList.length - 1];
          if (cache.includes(objectPath)) {
            env.classes.push('exist-property');
          } else {
            cache.push(objectPath);
          }
        }
      }

      if (startList.includes(env.content)) {
        env.classes.push('brace', 'brace-start');
      }
      if (endList.includes(env.content)) {
        env.classes.push('brace', 'brace-end');
      }
    });
  }
}

export function unRegisterPlugin(uid: symbol) {
  editorCacheMap.delete(uid);
}
