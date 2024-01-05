import type { Language, PrismTheme } from 'prism-react-renderer';
import { Highlight } from 'prism-react-renderer';

const theme: PrismTheme = {
  plain: {},
  styles: [
    {
      types: [
        'comment',
        'prolog',
        'doctype',
        'cdata',
        'punctuation',
        'namespace',
        'operator',
        'tag',
        'number',
        'property',
        'function',
        'tag-id',
        'selector',
        'atrule-id',
        'attr-name',
        'string',
        'boolean',
        'entity',
        'url',
        'attr-value',
        'keyword',
        'control',
        'directive',
        'unit',
        'statement',
        'regex',
        'atrule',
        'placeholder',
        'variable',
        'deleted',
        'inserted',
        'italic',
        'important',
        'bold',
      ],
      style: {},
    },
  ],
};

export function Code({
  code,
  language,
  withLineNumbers,
}: {
  code: string;
  language: Language;
  withLineNumbers?: boolean;
}) {
  return (
    <Highlight code={code} theme={theme} language={language}>
      {({ className, tokens, getLineProps, getTokenProps }) => (
        <pre className={className}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line, key: i })}>
              {withLineNumbers && <span className="line-number">{i + 1}</span>}
              <span className="line-content">
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token, key })} />
                ))}
              </span>
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
