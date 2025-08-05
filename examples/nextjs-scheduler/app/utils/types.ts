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
  actions: {
    addContent(date: string, text: string): void;
    deleteContent(date: string): void;
    updateContent(date: string, text: string): void;
  };
}

export type ChangeEventHandler = (
  event: React.ChangeEvent<HTMLInputElement>,
) => void;

type ValuePiece = Date;

export type CalendarValue = ValuePiece | [ValuePiece, ValuePiece];
