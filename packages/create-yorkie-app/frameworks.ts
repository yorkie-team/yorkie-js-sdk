import { cyan, lightGreen, reset, yellow } from 'kolorist';

/**
 * @see https://github.com/marvinhagemeister/kolorist#readme
 */
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
      },
      {
        name: 'vanilla-quill',
        display: 'quill',
      },
      {
        name: 'profile-stack',
        display: 'profile-stack',
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
      },
      {
        name: 'react-todomvc',
        display: 'todomvc',
      },
      {
        name: 'simultaneous-cursors',
        display: 'simultaneous-cursors',
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
      },
    ],
  },
];
