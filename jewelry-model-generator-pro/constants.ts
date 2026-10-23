import { JewelryType, ViewType, ModelGender } from "./types";

// Fallback images - High quality Asian Models
const FALLBACK_IMAGES: Record<ModelGender, string[]> = {
    [ModelGender.FEMALE]: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1000&auto=format&fit=crop', // Classic Asian Female Portrait
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1554151228-14d9def656e4?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1589156280159-27698a70f29e?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1596245468202-e7195460591e?q=80&w=1000&auto=format&fit=crop',
    ],
    [ModelGender.MALE]: [
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=1000&auto=format&fit=crop', // Asian Male Portrait
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1521119989659-a83eee488004?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1557862921-37829c790f19?q=80&w=1000&auto=format&fit=crop',
    ]
};

const getFallback = (gender: ModelGender): string => {
    const images = FALLBACK_IMAGES[gender];
    const randomIndex = Math.floor(Math.random() * images.length);
    return images[randomIndex];
};

// Database of base images organized by Gender -> Jewelry Type -> View Type
// Each category now contains an array of images for random selection.
export const MODEL_DATABASE: Record<ModelGender, Record<JewelryType, Record<ViewType, string[]>>> = {
  [ModelGender.FEMALE]: {
    [JewelryType.NECKLACE]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1616165893380-4da877c44567?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1589428193847-76818a1b14a2?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1605406575861-33b2512a2a4a?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1611601322175-804153039a79?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1605406575861-33b2512a2a4a?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1508243771214-6e95d137426b?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1589322074239-b2b3c2447d29?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.PENDANT]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1616165893380-4da877c44567?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1589428193847-76818a1b14a2?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1620752830212-5b43a9d3a7ea?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1611601322175-804153039a79?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1594744806549-83a888849896?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1589322074239-b2b3c2447d29?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1563396909995-09a244125b65?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.EARRINGS]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1610056003294-8d4993da8b73?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1588624104036-3b32a5d25eaa?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1508243771214-6e95d137426b?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1588624104036-3b32a5d25eaa?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1554151228-14d9def656e4?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1595665593673-bf1ad72905c0?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.RING]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1615984183884-c5a47e62d4e9?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1560228338-a47a163a3556?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1593192225439-359d9363a891?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1554151228-14d9def656e4?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1594744806549-83a888849896?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1562447196-85d1e233f25d?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1589156280159-27698a70f29e?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1596245468202-e7195460591e?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.BRACELET]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1593192225439-359d9363a891?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1601836120894-348b61c8d455?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1615984183884-c5a47e62d4e9?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1620752830212-5b43a9d3a7ea?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1562447196-85d1e233f25d?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1594744806549-83a888849896?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1563396909995-09a244125b65?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1000&auto=format&fit=crop',
      ],
    },
  },
  [ModelGender.MALE]: {
    [JewelryType.NECKLACE]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1597401750021-9318f7d8c859?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1627161683077-e34782341d31?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1557862921-37829c790f19?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1617137968427-85924c809a10?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1624424354228-345037d571b7?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.PENDANT]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1597401750021-9318f7d8c859?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1601622345091-b954e7661b3c?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1615392825254-d243389481a7?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1617137968427-85924c809a10?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1521119989659-a83eee488004?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1552642986-ccb41e705d5d?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.EARRINGS]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1504593811423-6dd665756598?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1627161683077-e34782341d31?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1635542337533-903c51a273c1?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1617137968427-85924c809a10?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1500013322082-a08b517f8582?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.RING]: {
       [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1601622345091-b954e7661b3c?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1621832049098-b8c78c2e3f6a?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1557862921-37829c790f19?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1615392825254-d243389481a7?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1617137968427-85924c809a10?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1624424354228-345037d571b7?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1613031019773-614c776ec33a?q=80&w=1000&auto=format&fit=crop',
      ],
    },
    [JewelryType.BRACELET]: {
      [ViewType.CLOSE_UP]: [
        'https://images.unsplash.com/photo-1621832049098-b8c78c2e3f6a?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1556742043-11b33842a2b6?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1601622345091-b954e7661b3c?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.MEDIUM_SHOT]: [
        'https://images.unsplash.com/photo-1635542337533-903c51a273c1?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1615392825254-d243389481a7?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=1000&auto=format&fit=crop',
      ],
      [ViewType.FULL_SHOT]: [
        'https://images.unsplash.com/photo-1552642986-ccb41e705d5d?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1613031019773-614c776ec33a?q=80&w=1000&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?q=80&w=1000&auto=format&fit=crop',
      ],
    },
  },
};

// Retrieve the best matching model image
export const getModelImage = (gender: ModelGender, type: JewelryType, view: ViewType): string => {
  try {
    const images = MODEL_DATABASE[gender][type][view];
    if (images && images.length > 0) {
      // Select a random image from the array
      const randomIndex = Math.floor(Math.random() * images.length);
      return images[randomIndex];
    }
    return getFallback(gender); // Fallback if array is empty or doesn't exist
  } catch (e) {
    return getFallback(gender);
  }
};

export const PLACEHOLDER_PRODUCT = 'https://images.unsplash.com/photo-1599643478518-17488fbbcd75?q=80&w=1000&auto=format&fit=crop';

