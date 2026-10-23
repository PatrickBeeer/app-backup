the excel-parser app (/root/projects/unityshop/apps/tooling/excel-parser) should be able to do the following:
taking an excel file and convert it into csv files (an excel file can have multiple sheets) and images with their location recorded as image names (sheet<sheet_name>_column<column>_row<row>)

and here is what I want:

* the financial-dashboard app now has its own excel parser, please replace it with calling excel-parser app (internal call with container name), any extra functionality or modification related to excel parsing can be added to the excel-parser app

* the output results from the parser app should then be used to to call "gemini-3-flash-preview" model via the api manager, and the prompt should be constructed in a way that can ensure the output can be used by the financial-dashboard app's 智能录入 function. the final none-llm parser should be thin, the heavy lifting should be done by the llm call. current parser is rigid, it should be replaced. also the images are usually screen shots of financial transactions, they should be used in the llm parsing along with the csv sheets and prompt, if there are too many images, use multiple calls, and set a limit

can you give me a plan on how to implement this