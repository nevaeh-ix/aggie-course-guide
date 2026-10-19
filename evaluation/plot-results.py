"""Plot the saved results from the three-model comparison."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

root=Path(__file__).resolve().parent
data=json.loads((root/'latest-results.json').read_text())
models=['tfidf','bm25','semantic']
labels=['TF-IDF','BM25','MiniLM']
literal=[100*data['metrics'][m]['literal']['targetHitAt3'] for m in models]
natural=[100*data['metrics'][m]['natural']['targetHitAt3'] for m in models]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'svg.fonttype':'none','pdf.fonttype':42})
fig,ax=plt.subplots(figsize=(6.4,3.6),layout='constrained')
x=np.arange(3);width=.33
bars1=ax.bar(x-width/2,literal,width,label='Literal keyword query',color='#24476D')
bars2=ax.bar(x+width/2,natural,width,label='Natural-language query',color='#D4A11E',hatch='//',edgecolor='#7A5A09',linewidth=.5)
ax.set(xticks=x,xticklabels=labels,ylim=(0,115),yticks=[0,20,40,60,80,100],ylabel='Designated-target Hit@3 (%)',xlabel='Retrieval model')
ax.spines[['top','right']].set_visible(False)
ax.set_axisbelow(True);ax.grid(axis='y',alpha=.2)
ax.bar_label(bars1,labels=[f'{value:.0f}%' for value in literal],padding=3,fontsize=9)
ax.bar_label(bars2,labels=[f'{value:.1f}%' for value in natural],padding=3,fontsize=9)
ax.legend(loc='upper center',bbox_to_anchor=(.5,1.22),ncol=2,frameon=False,fontsize=9)
folder=root/'figures';folder.mkdir(exist_ok=True)
for ext in ['svg','png','pdf']:fig.savefig(folder/f'target-hit-by-query-type.{ext}',dpi=220)
plt.close(fig)
print('Saved measured-results figure as SVG, PNG, and PDF.')
