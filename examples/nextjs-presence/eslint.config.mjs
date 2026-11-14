import nextConfig from 'eslint-config-next';
import { globalIgnores } from 'eslint/config';

const eslintConfig = [...nextConfig, globalIgnores(['dist/*'])];

export default eslintConfig;
