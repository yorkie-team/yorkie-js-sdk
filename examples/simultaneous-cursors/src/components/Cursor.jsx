import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';

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

  // Pixel-based anchoring for drawing tools: treat (x,y) as the tip.
  // Width/height come from each SVG's intrinsic size. tipX/tipY are offsets
  // from (center-bottom) anchor to actual drawing tip (positive right/down).
  // Initial values are estimates; adjust after visual check.
  const toolOffsets = {
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
        <img
          src={`/icons/icon_${iconBase}.svg`}
          className={`${selectedCursorShape}-cursor${
            animate ? ' animated-remote-cursor' : ''
          }`}
          style={{
            position: 'fixed',
            transform: `translate3d(${x}px, ${y}px, 0) ${transformStyle}`,
            pointerEvents: 'none',
            zIndex: 10001,
          }}
          alt={iconBase}
        />
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
