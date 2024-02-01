import { TimeTicket } from '@yorkie-js-sdk/src/yorkie';

export type Shape = Line | EraserLine | Rect;

export type Point = {
  y: number;
  x: number;
};

export interface BaseShape {
  type: string;
  getID(): TimeTicket;
}
export interface Box {
  y: number;
  x: number;
  width: number;
  height: number;
}

export interface Line extends BaseShape {
  type: 'line';
  color: string;
  strokeWidth: number;
  points: Array<Point>;
}

export interface Rect extends BaseShape {
  type: 'rect';
  color: string;
  strokeWidth: number;
  points: Array<Point>;
  box: Box;
}

export interface EraserLine extends BaseShape {
  type: 'eraser';
  points: Array<Point>;
}

export type ToonieDoc = {
  profiles: Record<string, string>;
  shapes: Array<Shape>;
  imgUrl: string | undefined;
  images: Array<ImageElement>;
};

export type ImageElement = {
  name: string;
  url: string;
  width: number;
  height: number;
  position: Point;
};
