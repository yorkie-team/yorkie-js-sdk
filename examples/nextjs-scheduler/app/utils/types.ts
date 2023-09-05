export interface ENVtypes {
  url: string;
  apiKey: string;
}

export interface ContentTypes {
  date: string;
  text: string;
}

export interface EditorPropsTypes {
  content: Array<ContentTypes>;
  actions: { [name: string]: any };
}

export type ChangeEventHandler = (
  event: React.ChangeEvent<HTMLInputElement>,
) => void;

type ValuePiece = Date | any;

export type CalendarValue = ValuePiece | [ValuePiece, ValuePiece];
