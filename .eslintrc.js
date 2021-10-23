module.exports = {
  root: true,
  env: {
    browser: true,
  },
  plugins: ['prettier'],
  extends: ['airbnb', 'prettier'],
  rules: {
    'prettier/prettier': 'warn',
    'no-underscore-dangle': 'off',
  },
};
