# Looker Studio Dashboard Cloner (lsd-cloner)

It's an interactive tool for cloning Looker Studio (previously known as Data Studio) dashboards.

The tool asks a series of question and generates a link (using Linking API), once opened it will copy a dashboard with all its datasources.


## Installation

```
npm i -g lsd-cloner
```

## Usage
Once installed globally (with `-g` option) it provides `lsd-cloner` CLI tool. Run it and follow instructions.

Run with pre-polulated answers:
```
lsd-cloner --answer=answers.json
```


save answers into a file:
```
lsd-cloner --save=answers.json
```

You can run it in a non-interactive environment (SSH), just open a generated link manually.

## Disclaimer
This is not an officially supported Google product.
