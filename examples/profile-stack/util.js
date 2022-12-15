const NAMES = [
  'Ali',
  'Beatriz',
  'Charles',
  'Diya',
  'Eric',
  'Fatima',
  'Gabriel',
  'Hanna',
  'Johnson',
  'Perry',
  'Parker',
  'Kelly',
];
export const getRandomName = () => {
  const index = Math.floor(Math.random() * NAMES.length);
  return NAMES[index];
};

const COLORS = ['red', 'yellow', 'orange', 'green', 'blue', 'purple'];
export const getRandomColor = () => {
  const index = Math.floor(Math.random() * COLORS.length);
  return COLORS[index];
};
