import { cyan, lightGreen, reset, yellow } from 'kolorist';

type ColorFunc = (str: string | number) => string;
export type Framework = {
  name: string;
  display: string;
  color: ColorFunc;
  variants: Array<FrameworkVariant>;
};
type FrameworkVariant = {
  /**
   * directory name of the example
   */
  name: string;
  /**
   * display name (in prompt) of the example
   */
  display: string;
  /**
   * highlight color
   * @see https://github.com/marvinhagemeister/kolorist#readme
   */
  color: ColorFunc;
};

export const FRAMEWORKS: Array<Framework> = [
  {
    name: 'vanilla',
    display: 'Vanilla',
    color: yellow,
    variants: [
      {
        name: 'vanilla-codemirror6',
        display: 'codemirror',
        color: yellow,
      },
      {
        name: 'vanilla-quill',
        display: 'quill',
        color: yellow,
      },
      {
        name: 'profile-stack',
        display: 'profile-stack',
        color: yellow,
      },
    ],
  },
  {
    name: 'react',
    display: 'React',
    color: cyan,
    variants: [
      {
        name: 'react-tldraw',
        display: 'tldraw',
        color: cyan,
      },
      {
        name: 'react-todomvc',
        display: 'todomvc',
        color: cyan,
      },
      {
        name: 'simultaneous-cursors',
        display: 'simultaneous-cursors',
        color: cyan,
      },
    ],
  },
  {
    name: 'nextjs',
    display: 'Next.js',
    color: reset,
    variants: [
      {
        name: 'nextjs-scheduler',
        display: 'scheduler',
        color: reset,
      },
    ],
  },
  {
    name: 'vue',
    display: 'Vue',
    color: lightGreen,
    variants: [
      {
        name: 'vuejs-kanban',
        display: 'kanban',
        color: lightGreen,
      },
    ],
  },
];
