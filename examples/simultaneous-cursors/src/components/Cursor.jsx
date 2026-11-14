import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';
import ColoredIcon from './ColoredIcon';

// Maps an icon's box to the point that should sit on the pointer (the nib
// of the pen or highlighter). Other icons are anchored at center-bottom.
const tipOffsets = {
  pen: { w: 36, h: 36, tipX: 18, tipY: 38 },
  highlighter: { w: 23, h: 24, tipX: 5, tipY: -8 },
};

export default function Cursor({
  shape,
  fadeEnabled,
  cursor,
  pointerDown,
  overInteractive,
  color,
  viewport,
  animate,
}) {
  const tool = shape === 'pen' && fadeEnabled ? 'fading' : shape;
  const icon = shape === 'eraser' ? 'line' : tool;
  const off = tipOffsets[tool === 'fading' ? 'pen' : tool];
  const anchor = off
    ? `translate(${-(off.w / 2) + off.tipX}px, ${-off.h + off.tipY}px)`
    : 'translate(-50%, -100%)';

  // Presence carries the position as a fraction of the viewport.
  const x = cursor ? cursor.x * viewport.width : 0;
  const y = cursor ? cursor.y * viewport.height : 0;

  return (
    <>
      {cursor && !overInteractive && (
        <div
          className={`cursor${animate ? ' cursor-animated' : ''}`}
          style={{ transform: `translate3d(${x}px, ${y}px, 0) ${anchor}` }}
        >
          <ColoredIcon type={icon} color={color} />
        </div>
      )}
      {cursor && (shape === 'heart' || shape === 'thumbs') && (
        <FullAnimation pointerDown={pointerDown} x={x} y={y} shape={shape} />
      )}
      <PenCursor
        tool={tool}
        cursor={cursor}
        pointerDown={pointerDown}
        color={color}
      />
    </>
  );
}
