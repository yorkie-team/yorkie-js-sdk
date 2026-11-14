import { CursorComponent } from '@tldraw/core';

/**
 * `CustomCursor` draws another user's cursor with their name, in the colour
 * from their presence.
 */
const CustomCursor: CursorComponent<{ name: string }> = ({
  color,
  metadata,
}) => {
  return (
    <div className="cursor">
      <span className="cursor__dot" style={{ background: color }} />
      {metadata?.name && (
        <span className="cursor__name" style={{ background: color }}>
          {metadata.name}
        </span>
      )}
    </div>
  );
};

export default CustomCursor;
