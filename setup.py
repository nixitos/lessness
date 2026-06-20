from setuptools import setup, find_packages

setup(
    name="lessness-bot",
    version="1.0.0",
    description="SDK для ботов LessNess",
    packages=find_packages(),
    install_requires=["websockets>=10.0"],
    python_requires=">=3.7",
)