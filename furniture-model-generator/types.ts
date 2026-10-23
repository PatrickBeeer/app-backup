export interface ModelOptions {
  ethnicity: string;
  style: string;
  gender: string;
  age: string;
  pose: string;
  [key: string]: string; // Index signature
}

export interface Option {
  value: string;
  label: string;
}

export interface OptionCategory {
  key: keyof ModelOptions;
  label: string;
  options: Option[];
}

