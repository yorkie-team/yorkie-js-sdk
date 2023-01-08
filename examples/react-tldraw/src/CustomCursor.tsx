import { CursorComponent } from '@tldraw/core';

// A custom cursor component.
// Component overrides for the tldraw renderer
const CustomCursor: CursorComponent<{ name: 'Anonymous' }> = ({
  color,
  metadata,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        width: 'fit-content',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          background: color,
          borderRadius: '100%',
        }}
      />
      <div
        style={{
          background: 'white',
          padding: '4px 8px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {metadata!.name}
      </div>
    </div>
  );
};

export default CustomCursor;
