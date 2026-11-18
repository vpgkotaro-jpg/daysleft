# Field-extraction eval (PSM 3, 12 images)

| field | correct | wrong value | not found |
|---|---|---|---|
| name | 12/12 (100%) | 0 | 0 |
| strength | 12/12 (100%) | 0 | 0 |
| quantity | 11/12 (92%) | 0 | 1 |
| dose | 12/12 (100%) | 0 | 0 |
| timesPerDay | 12/12 (100%) | 0 | 0 |

All five fields correct on an image: 11/12 (92%)
Units per day correct: 12/12 (100%)

| condition | all fields correct |
|---|---|
| clean | 3/3 (100%) |
| lowres | 2/3 (67%) |
| noisy | 3/3 (100%) |
| rotate | 3/3 (100%) |

## Per image

| image | OCR conf | name | strength | quantity | dose | times/day |
|---|---|---|---|---|---|---|
| label1_clean.png | 93 | ok | ok | ok | ok | ok |
| label1_lowres.jpg | 81 | ok | ok | ok | ok | ok |
| label1_noisy.jpg | 87 | ok | ok | ok | ok | ok |
| label1_rotate.png | 92 | ok | ok | ok | ok | ok |
| label2_clean.png | 92 | ok | ok | ok | ok | ok |
| label2_lowres.jpg | 70 | ok | ok | not found | ok | ok |
| label2_noisy.jpg | 83 | ok | ok | ok | ok | ok |
| label2_rotate.png | 89 | ok | ok | ok | ok | ok |
| label3_clean.png | 93 | ok | ok | ok | ok | ok |
| label3_lowres.jpg | 76 | ok | ok | ok | ok | ok |
| label3_noisy.jpg | 80 | ok | ok | ok | ok | ok |
| label3_rotate.png | 89 | ok | ok | ok | ok | ok |
