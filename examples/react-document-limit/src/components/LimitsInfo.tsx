/**
 * `LimitsInfo` explains the two per-document limits and how to try them.
 */
export function LimitsInfo() {
  return (
    <aside className="panel limits" aria-labelledby="limits-title">
      <h2 id="limits-title">What are document limits?</h2>
      <p>
        A Yorkie project can cap how many clients use one document at the same
        time. On Yorkie Cloud, set the caps in the Dashboard under your
        project's Settings, in the Resources section. 0 means no limit.
      </p>
      <dl>
        <dt>Max Attachments Per Document</dt>
        <dd>
          How many clients can attach to the document. One more is rejected when
          it attaches, and this page says the document is full.
        </dd>
        <dt>Max Subscribers Per Document</dt>
        <dd>
          How many attached clients can watch the document for live changes. One
          more stays attached but shows Offline, and the SDK retries every
          second until someone leaves.
        </dd>
      </dl>
      <h3>Try it</h3>
      <ol>
        <li>
          Set Max Attachments Per Document to 2 for the project whose API key
          this page uses. On Yorkie Cloud, use the Dashboard. On a local server,
          which the Dashboard can't see, log in with the CLI as the README shows
          and run{' '}
          <code>
            yorkie project update default --max-attachments-per-document 2
          </code>
          .
        </li>
        <li>Keep this tab open and open two more tabs of this page.</li>
        <li>The third tab can't attach and shows "This document is full".</li>
      </ol>
      <p className="limits__note">
        A changed setting can take up to 10 minutes to reach every server.
      </p>
    </aside>
  );
}
