
# ScalpShield with Dashboard (v5)

This package includes:
- **scalp_flag**-based data generator
- Model training with threshold tuning
- **Streamlit dashboard** that flags each purchase as green/yellow/red

Requirements:
- Use python 3.11

## Quickstart

```powershell
#Clone repository
git clone https://github.com/JustisDutt/Scalp_Shield.git

#Enter Directory
cd Scalp_Shield

# (optional) create a venv in this folder
python -3.11 -m venv .venv
. .\.venv\Scripts\Activate.ps1

# install deps
pip install -r requirements.txt

# generate sample data
python .\data\generate_synth.py --rows 3000

# train a model (stores models/model.pkl and artifacts)
python -m scripts.train

# run the dashboard
streamlit run dashboard.py
```
