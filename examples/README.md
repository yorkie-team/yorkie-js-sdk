# Examples

This directory contains examples of how to use Yorkie in various libraries and frameworks.

## Usage

All examples need to run the Yorkie server. So you should run the server before running examples.

```bash
# In the root directory of the repository.
$ docker-compose -f docker/docker-compose.yml up --build -d
```

The examples have own local dependencies. So you should install dependencies before running examples.

```bash
# In the directory of the example.
$ npm install
```

Then you can run the examples.

```bash
# In the directory of the example.
$ npm run dev
```

Open the browser and go to the URL that is printed in the terminal.
