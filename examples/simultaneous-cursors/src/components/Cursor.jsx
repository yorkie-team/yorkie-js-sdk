import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';
import ColoredIcon from './ColoredIcon';

export default function Cursor({
  selectedCursorShape,
  x,
  y,
  pointerDown,
  fadeEnabled,
  color,
  visible = true,
  resetNonce = 0,
  overInteractive = false,
  animate = true,
}) {
  const baseTool = selectedCursorShape;
  const tool = fadeEnabled && baseTool === 'pen' ? 'fading' : baseTool;

  const iconBase =
    selectedCursorShape === 'pen' && fadeEnabled
      ? 'fading'
      : selectedCursorShape === 'eraser'
      ? 'line'
      : selectedCursorShape;

  const drawingTools = ['pen', 'highlighter', 'eraser', 'fading'];
  const toolOffsets = {
    // These offsets map the SVG's center-bottom anchor to the actual nib/tip.
    // tipX: horizontal pixels from center to nib (positive right)
    // tipY: vertical pixels from bottom to nib (positive down)
    pen: { w: 36, h: 36, tipX: 18, tipY: 38 },
    highlighter: { w: 23, h: 24, tipX: 5, tipY: -8 },
  };

  // 'fading' shares the pen icon dimensions (iconBase becomes 'fading' though)
  const baseForOffsets = iconBase === 'fading' ? 'pen' : iconBase;
  const off = toolOffsets[baseForOffsets];
  const usePixelAnchor = !!off; // apply to pen/highlighter(+fading)
  const transformStyle = usePixelAnchor
    ? `translate(${-(off.w / 2) + off.tipX}px, ${-off.h + off.tipY}px)`
    : 'translate(-50%, -100%)';

  return (
    <>
      {!overInteractive && (
        <div
          className={`${selectedCursorShape}-cursor${
            animate ? ' animated-remote-cursor' : ''
          }`}
          style={{
            position: 'fixed',
            transform: `translate3d(${x}px, ${y}px, 0) ${transformStyle}`,
            pointerEvents: 'none',
            zIndex: 10001,
          }}
        >
          <ColoredIcon type={iconBase} color={color} />
        </div>
      )}

      {(selectedCursorShape === 'heart' ||
        selectedCursorShape === 'thumbs') && (
        <FullAnimation
          pointerDown={pointerDown}
          xPos={x}
          yPos={y}
          selectedCursorShape={selectedCursorShape}
        />
      )}

      {drawingTools.includes(tool) && (
        <PenCursor
          xPos={x}
          yPos={y}
          tool={tool}
          color={color}
          pointerDown={pointerDown}
          visible={visible}
          resetNonce={resetNonce}
        />
      )}
    </>
  );
}
