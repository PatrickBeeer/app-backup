import type { Option, OptionCategory } from './types';

export const furnitureTypes: Option[] = [
  { value: 'bed', label: '床' },
  { value: 'sofa', label: '沙发' },
  { value: 'armchair', label: '扶手椅' },
  { value: 'dining table with chairs', label: '餐桌椅组合' },
  { value: 'desk', label: '书桌' },
  { value: 'bookshelf', label: '书架' },
];

export const modelOptionsConfig: OptionCategory[] = [
  {
    key: 'ethnicity',
    label: '模特人种',
    options: [
      { value: 'Asian', label: '亚洲人' },
      { value: 'Caucasian', label: '白种人' },
      { value: 'Hispanic', label: '拉丁裔' },
      { value: 'Black', label: '非洲裔' },
    ],
  },
  {
    key: 'gender',
    label: '模特性别',
    options: [
      { value: 'a woman', label: '女性' },
      { value: 'a man', label: '男性' },
      { value: 'a couple (man and woman)', label: '情侣(男女)' },
      { value: 'a boy', label: '男孩' },
      { value: 'a girl', label: '女孩' },
    ],
  },
  {
    key: 'age',
    label: '模特年龄',
    options: [
      { value: 'young adult in their 20s', label: '20多岁' },
      { value: 'adult in their 30s', label: '30多岁' },
      { value: 'adult in their 40s', label: '40多岁' },
      { value: 'a young child (around 5-10 years old)', label: '儿童 (5-10岁)' },
      { value: 'a family with a young child', label: '家庭(带小孩)' },
    ],
  },
  {
    key: 'style',
    label: '模特风格',
    options: [
      { value: 'Chinese social media influencer style, trendy and chic', label: '网红风 (小红书)' },
      { value: 'modern, minimalist, and elegant, inspired by high-end furniture brands', label: '现代简约 (品牌风)' },
      { value: 'warm, cozy, and family-oriented, with a natural feel', label: '温馨居家 (生活感)' },
      { value: 'Northern European hygge style, comfortable and simple', label: '北欧生活' },
      { value: 'professional business casual', label: '商务休闲' },
    ],
  },
  {
    key: 'pose',
    label: '模特姿势/活动',
    options: [
      { value: 'relaxing comfortably', label: '舒适地放松' },
      { value: 'reading a book', label: '阅读' },
      { value: 'using a laptop', label: '使用笔记本电脑' },
      { value: 'sleeping peacefully', label: '安静地睡觉' },
      { value: 'chatting and smiling', label: '微笑交谈' },
      { value: 'drinking coffee', label: '喝咖啡' },
    ],
  },
];

