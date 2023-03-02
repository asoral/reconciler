# Copyright (c) 2022, Aerele Technologies Private Limited and contributors
# For license information, please see license.txt

# import frappe


# Copyright (c) 2013, Aerele Technologies Private Limited and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe, json
from frappe import _
from frappe.utils import comma_and, add_months, getdate
from six import string_types
from reconciler.reconciler.doctype.cd_gstr_2b_data_upload_tool.cd_gstr_2b_data_upload_tool import *
from frappe.utils.user import get_users_with_role
from six import string_types
import copy
from frappe.core.doctype.communication.email import make
import time,datetime
from frappe.utils import cint, flt, getdate,formatdate

def execute(filters=None):
	return MatchingTool(filters).run()

class MatchingTool(object):
	def __init__(self, filters=None):
		self.filters = frappe._dict(filters or {})

	def run(self):
		self.get_columns()
		self.get_data()
		return self.columns, self.data

	def get_columns(self):
		if self.filters['view_type'] == 'Supplier View':
			self.columns = [{
					"label": "GSTIN",
					"fieldname": "gstin",
					"fieldtype": "Link",
					"options": "Supplier",
					"width": 140
				},
				{
					"label": "Supplier",
					"fieldname": "supplier",
					"fieldtype": "Link",
					"options": "Supplier",
					"width": 200
				},
				{
					"label": "Tax Diff",
					"fieldname": "tax_difference",
					"fieldtype": "Float",
					"width": 100
				},
				{
					"label": "Total 2B",
					"fieldname": "total_2b",
					"fieldtype": "Int",
					"width": 80
				},
				{
					"label": "Total PI",
					"fieldname": "total_pr",
					"fieldtype": "Int",
					"width": 80
				},
				{
					"label": "Total Pending Entries",
					"fieldname": "total_pending_documents",
					"fieldtype": "Int",
					"width": 150
				}
				]
		else:
			self.columns = []

	def get_data(self):
		data = []
		if self.filters['based_on'] == 'Return Period':
			if 'return_period' in self.filters and self.filters['return_period']:
				gstr2b_conditions = [['cf_return_period','=',self.filters['return_period']]]
				month_threshold = -(frappe.db.get_single_value('CD GSTR 2B Settings', 'month_threshold'))
				return_period_year = int(self.filters['return_period'][-4::])
				return_period_month = int(self.filters['return_period'][:2])
				to_date = last_day_of_month(return_period_year, return_period_month)
				if not to_date:
					frappe.throw(_(f'To date not found for the PI filters'))

				from_date = add_months(to_date, month_threshold)

			else:
				frappe.throw(_("Please select return period"))
		else:
			if not self.filters['from_date']:
				frappe.throw(_("Please select from date"))
			if not self.filters['to_date']:
				frappe.throw(_("Please select to date"))
 			
			from_date = self.filters['from_date']
			to_date = self.filters['to_date']
			gstr2b_conditions = [['cf_document_date' ,'>=',self.filters['from_date']],
			['cf_document_date' ,'<=',self.filters['to_date']]]

			pr_conditions = [['bill_date' ,'>=',self.filters['from_date']],
			['bill_date' ,'<=',self.filters['to_date']]]
 
		if self.filters['view_type'] == 'Supplier View':
			gstr2b_conditions.extend([
			['cf_company_gstin', '=', self.filters['company_gstin']]])

			if 'transaction_type' in self.filters:
				gstr2b_conditions.append(['cf_transaction_type' ,'=', self.filters['transaction_type']])

			gstr2b_entries = frappe.db.get_all('CD GSTR 2B Entry', filters= gstr2b_conditions, fields =['cf_party_gstin','cf_party', 'cf_tax_amount', 'cf_purchase_invoice', 'cf_status'])
			
			if not self.filters['based_on'] == 'Return Period':
				pr_conditions.extend([
				['docstatus' ,'=', 1],
				['company_gstin', '=', self.filters['company_gstin']]])
				pr_entries = frappe.db.get_all('Purchase Invoice', filters=pr_conditions, fields =['supplier_gstin', 'supplier', 'name'])
			else:
				pr_entries = []
				for entry in gstr2b_entries:
					if entry['cf_purchase_invoice']:
						doc = frappe.get_doc('Purchase Invoice', entry['cf_purchase_invoice'])
						pr_entries.append({'supplier_gstin':doc.supplier_gstin,
						'supplier':doc.supplier,
						'name':doc.name})

			gstin_wise_data = {}
			
			for entry in gstr2b_entries:
				if not entry['cf_party_gstin'] in gstin_wise_data:
					gstin_wise_data[entry['cf_party_gstin']] = [entry['cf_party'], entry['cf_tax_amount'], 0]
				else:
					gstin_wise_data[entry['cf_party_gstin']][1] += entry['cf_tax_amount']
			
			if not 'transaction_type' in self.filters or \
				self.filters['transaction_type'] == 'Invoice':
				for entry in pr_entries:
					if not entry['supplier_gstin'] in gstin_wise_data:
						gstin_wise_data[entry['supplier_gstin']] = [entry['supplier'], 0, get_tax_details(entry['name'])['total_tax_amount']]
					else:
						gstin_wise_data[entry['supplier_gstin']][2] += get_tax_details(entry['name'])['total_tax_amount']

			for key in gstin_wise_data.keys():
				total_2b = len([entry for entry in gstr2b_entries if entry['cf_party_gstin'] == key])
				total_pr = len([entry for entry in pr_entries if entry['supplier_gstin'] == key])
				total_pending = len([entry for entry in gstr2b_entries if entry['cf_party_gstin'] == key and entry['cf_status'] == 'Pending'])
				if total_pr > total_2b:
					total_pending += total_pr - total_2b
				row = {	'supplier': gstin_wise_data[key][0],
						'gstin': key, 
						'tax_difference': round(abs(gstin_wise_data[key][1]- gstin_wise_data[key][2]), 2),
						'total_2b': total_2b,
						'total_pr': total_pr,
						'total_pending_documents': total_pending}
				data.append(row)

		else:
			match_status = ["Exact Match", "Partial Match", "Probable Match", "Mismatch", "Missing in PI", "Missing in 2B"]
			document_status = ['Pending', 'Accepted']
			
			if 'match_status' in self.filters:
				match_status = [self.filters['match_status']]
			
			if 'document_status' in self.filters:
				document_status = [self.filters['document_status']]

			if 'supplier' in self.filters:
				suppliers = [self.filters['supplier']]

			gstr2b_conditions.extend([
			['cf_status', 'in', document_status],
			['cf_match_status','in', match_status],
			['cf_company_gstin', '=', self.filters['company_gstin']]])

			if 'transaction_type' in self.filters:
				gstr2b_conditions.append(['cf_transaction_type' ,'=', self.filters['transaction_type']])
			if 'supplier' in self.filters and not 'supplier_gstin' in self.filters:
				gstr2b_conditions.append(['cf_party', 'in', suppliers])

			if not 'supplier' in self.filters and not 'supplier_gstin' in self.filters:
				self.columns +=[{
					"label": "Supplier",
					"fieldname": "supplier",
					"fieldtype": "Link",
					"options": "Supplier",
					"width": 200
				},
				{
					"label": "Supplier Name",
					"fieldname": "supplier_name",
					"fieldtype": "data",
					"width": 200
				},
				
				{
					"label": "GSTIN",
					"fieldname": "gstin",
					"fieldtype": "Link",
					"options": "Supplier",
					"width": 140
				}]

			if 'supplier_gstin' in self.filters:
				gstr2b_conditions.append(['cf_party_gstin', '=', self.filters['supplier_gstin']])

			self.columns += [{
					"label": "2B Inv No",
					"fieldname": "2b_invoice_no",
					"fieldtype": "Data",
					"width": 150
				},
				{
					"label": "PI Inv No",
					"fieldname": "pr_invoice_no",
					"fieldtype": "Data",
					"width": 100
				},
				{
					"label": "2B Inv Date",
					"fieldname": "2b_invoice_date",
					"fieldtype": "Data",
					"width": 90
				},
				{
					"label": "PI Inv Date",
					"fieldname": "pr_invoice_date",
					"fieldtype": "Data",
					"width": 90
				},
				{
					"label": "2B Taxable Amt",
					"fieldname": "2b_taxable_value",
					"fieldtype": "Float",
					"width": 110
				},
				{
					"label": "PI Taxable Amt",
					"fieldname": "pr_taxable_value",
					"fieldtype": "Float",
					"width": 110
				},
				{
					"label": "Tax Diff",
					"fieldname": "tax_difference",
					"fieldtype": "Float",
					"width": 70
				},
				{
					"label": "Match Status",
					"fieldname": "match_status",
					"fieldtype": "Data",
					"width": 95
				},
				{
					"label": "Reason",
					"fieldname": "reason",
					"fieldtype": "Data",
					"width": 150
				},
				{
					"label": "Status",
					"fieldname": "status",
					"fieldtype": "Data",
					"width": 70
				},
				{
					"label": "Remarks",
					"fieldname": "remarks",
					"fieldtype": "Small Text",
					"width": 200
				},
				{
					"label": "Eligibility For ITC",
					"fieldname": "eligibility_for_itc",
					"fieldtype": "Select",
					"width": 100
				},
				{
					"label": "2B CGST",
					"fieldname": "itc_central_tax",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "2B IGST",
					"fieldname": "itc_integrated_tax",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "2B SGST",
					"fieldname": "itc_state_tax",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "2B Cess",
					"fieldname": "itc_cess_amount",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "PI CGST",
					"fieldname": "cf_cgst_amount",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "PI IGST",
					"fieldname": "cf_igst_amount",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "PI SGST",
					"fieldname": "cf_sgst_amount",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "PI Cess",
					"fieldname": "cf_cess_amount",
					"fieldtype": "Currency",
					"width": 100
				},
				{
					"label": "PI Actions",
					"fieldname": "pr_actions",
					"fieldtype": "HTML",
					"width": 100
				}
				]
			gstr2b_entries = frappe.db.get_all('CD GSTR 2B Entry', filters= gstr2b_conditions, fields =['cf_document_number','cf_document_date', 'cf_party_gstin',
				'cf_purchase_invoice', 'cf_match_status', 'cf_reason', 'cf_status', 'cf_tax_amount','cf_taxable_amount', 'name', 'cf_party','cf_cess_amount','cf_sgst_amount','cf_igst_amount','cf_cgst_amount'])

			for entry in gstr2b_entries:
				bill_details = frappe.db.get_value("Purchase Invoice", {'name':entry['cf_purchase_invoice']}, ['bill_no', 'bill_date', 'total','itc_central_tax','itc_integrated_tax','itc_state_tax','itc_cess_amount','remarks','eligibility_for_itc'])
				print("kkkkkoooooooooooooooooo",bill_details)
				supl_name=frappe.db.get_value("Supplier",{'name':entry['cf_party']},['supplier_name'])
				print("0000000099999999999999999999999999999",supl_name)
				button = f"""
				<div>
				<Button class="btn btn-primary btn-xs left"  style="margin: 2px;" gstr2b = {entry["name"]} purchase_inv ={entry["cf_purchase_invoice"]} onClick='update_status(this.getAttribute("gstr2b"), this.getAttribute("purchase_inv"))'>View</a>
				<Button class="btn btn-primary btn-xs right" style="margin: 2px;" gstr2b = {entry["name"]} status = {entry['cf_status']} onClick='unlink_pr(this.getAttribute("gstr2b"), this.getAttribute("status"))'>Unlink</a>
				</div>"""
				if 'Missing in PI' == entry['cf_match_status']:
					button = f"""<div><Button class="btn btn-primary btn-xs left"  style="margin: 2px;" gstr2b = {entry["name"]} purchase_inv ={entry["cf_purchase_invoice"]} onClick='create_purchase_inv(this.getAttribute("gstr2b"), this.getAttribute("purchase_inv"))'>View</a>
					<Button class="btn btn-primary btn-xs right" style="margin: 2px;"  gstr2b = {entry["name"]}  from_date = {from_date} to_date = {to_date} onClick='get_unlinked_pr_list(this.getAttribute("gstr2b"), this.getAttribute("from_date"), this.getAttribute("to_date"))'>Link</a>
					</div>"""
				tax_diff = entry['cf_tax_amount']
				if entry['cf_purchase_invoice']:
					tax_diff = round(abs(entry['cf_tax_amount']- get_tax_details(entry['cf_purchase_invoice'])['total_tax_amount']), 2)
				
				data.append({
				'supplier': entry['cf_party'],
				'supplier_name': supl_name if supl_name and supl_name else None,

				'gstin': entry['cf_party_gstin'],
				'2b_invoice_no': entry['cf_document_number'],
				'2b_invoice_date': entry['cf_document_date'],  
				'pr_invoice_no': bill_details[0] if bill_details and bill_details[0] else None,
				'pr_invoice_date': bill_details[1] if bill_details and bill_details[1] else None,
				'tax_difference': tax_diff,
				'2b_taxable_value': entry['cf_taxable_amount'],
				'pr_taxable_value': bill_details[2] if bill_details and bill_details[2] else None,
				'match_status': entry['cf_match_status'], 
				'reason':entry['cf_reason'],
				'status': entry['cf_status'],
				'remarks': bill_details[7] if bill_details and bill_details[7] else None,
				'eligibility_for_itc': bill_details[8] if bill_details and bill_details[8] else None,
				'itc_cess_amount': entry['cf_cess_amount'], 
				'itc_state_tax': entry['cf_sgst_amount'], 
				'itc_integrated_tax': entry['cf_igst_amount'], 
				'itc_central_tax': entry['cf_cgst_amount'], 
				'cf_cgst_amount':bill_details[3] if bill_details and bill_details[3] else 0,
				'cf_igst_amount':bill_details[4] if bill_details and bill_details[4] else 0,
				'cf_sgst_amount':bill_details [5]if bill_details and bill_details[5] else 0,
				'cf_cess_amount':bill_details[6] if bill_details and bill_details[6] else 0,
				'pr_actions': button,
				'gstr_2b': entry['name']})

			if len(document_status) != 1 and 'Missing in 2B' in match_status and self.filters['based_on'] == 'Date':
				if not 'transaction_type' in self.filters or \
				self.filters['transaction_type'] == 'Invoice':
					pr_conditions.extend([
					['docstatus' ,'=', 1],
					['company_gstin', '=', self.filters['company_gstin']]])

					if 'supplier' in self.filters and not 'supplier_gstin' in self.filters:
						pr_conditions.append(['supplier' ,'in', suppliers])
					
					if 'supplier_gstin' in self.filters:
						pr_conditions.append(['supplier_gstin' ,'=', self.filters['supplier_gstin']])

					pr_entries = frappe.db.get_all('Purchase Invoice', filters=pr_conditions, fields =['name', 'bill_no', 'bill_date', 'total', 'supplier_gstin', 'supplier','supplier_name','itc_cess_amount','itc_state_tax','itc_integrated_tax','itc_central_tax','remarks','eligibility_for_itc'])
					print("oooooooppppppppppppppp",pr_entries)

					for inv in pr_entries:
						is_linked = frappe.db.get_value('CD GSTR 2B Entry', {'cf_purchase_invoice': inv['name']}, 'name')
						if not is_linked:
							tax_diff = get_tax_details(inv['name'])['total_tax_amount']
							button = f"""<Button class="btn btn-primary btn-xs center"  gstr2b = '' purchase_inv ={inv["name"]} onClick='render_summary(this.getAttribute("gstr2b"), this.getAttribute("purchase_inv"))'>View</a>"""
							data.append({
								'supplier': inv['supplier'],
								'supplier_name': inv['supplier_name'],
								'gstin': inv['supplier_gstin'],
								'2b_invoice_no': None,
								'2b_invoice_date': None,  
								'pr_invoice_no': inv['bill_no'],
								'pr_invoice_date': inv['bill_date'],
								'tax_difference': tax_diff,
								'2b_taxable_value': None,
								'pr_taxable_value': inv['total'],
								'match_status': 'Missing in 2B', 
								'reason':None,
								'status': None,
								'remarks': inv['remarks'],
								'eligibility_for_itc': inv['eligibility_for_itc'],
								# 'itc_cess_amount': inv['itc_cess_amount'],
								# 'itc_state_tax': inv['itc_state_tax'],
								# 'itc_central_tax': inv['itc_central_tax'],
								# 'itc_integrated_tax': inv['itc_integrated_tax'],
								'cf_cess_amount': inv['itc_cess_amount'],
								'cf_sgst_amount': inv['itc_state_tax'],
								'cf_cgst_amount': inv['itc_central_tax'],
								'cf_igst_amount': inv['itc_integrated_tax'],
								'pr_actions': button})
							
		self.data = data

@frappe.whitelist()
def return_period_query():
	return_period_list = []
	rp_list = frappe.db.get_list('CD GSTR 2B Data Upload Tool',['cf_return_period'])
	for data in rp_list:
		return_period_list.append(data['cf_return_period'])
	return sorted(set(return_period_list))

@frappe.whitelist()
def get_selection_details(gstr2b, purchase_inv):
	tax_details = {}
	other_details = {}
	main_details = {}
	gstr2b_doc = None
	pi_doc = None
	if gstr2b:
		gstr2b_doc = frappe.get_doc('CD GSTR 2B Entry', gstr2b)
	if not purchase_inv == 'None':
		pi_doc = frappe.get_doc('Purchase Invoice', purchase_inv)
		tax_wise_details = get_tax_details(purchase_inv)
		is_linked = frappe.db.get_value('CD GSTR 2B Entry', {'cf_purchase_invoice': purchase_inv}, 'name')
	
	if gstr2b_doc:
		tax_details['GSTR-2B'] = [gstr2b_doc.cf_taxable_amount,
							gstr2b_doc.cf_tax_amount,
							gstr2b_doc.cf_igst_amount,
							gstr2b_doc.cf_cgst_amount,
							gstr2b_doc.cf_sgst_amount,
							gstr2b_doc.cf_cess_amount]
		
		other_details['GSTR-2B'] = [
							gstr2b_doc.cf_document_number,
							gstr2b_doc.cf_document_date,
							gstr2b_doc.cf_place_of_supply,
							gstr2b_doc.cf_reverse_charge,
							gstr2b_doc.cf_return_period]

		main_details['GSTR-2B'] = [
							gstr2b_doc.cf_party,
							gstr2b_doc.cf_party_gstin,
							gstr2b_doc.cf_transaction_type,
							gstr2b_doc.cf_match_status,
							gstr2b_doc.cf_reason if gstr2b_doc.cf_reason else '-',
							gstr2b_doc.cf_status]
							
	if pi_doc:
		pi_details = [pi_doc.total,
						tax_wise_details['total_tax_amount']]
		for tax_amt_type in tax_wise_details:
			if not tax_amt_type == 'total_tax_amount':
				pi_details.append(round(tax_wise_details[tax_amt_type], 2))

		tax_details['PI'] = pi_details

		other_details['PI'] = [
							pi_doc.bill_no,
							pi_doc.bill_date,
							pi_doc.place_of_supply,
							pi_doc.reverse_charge,
							f'{pi_doc.posting_date.month}/{pi_doc.posting_date.year}']
		main_details['PI'] = [
							pi_doc.supplier,
							pi_doc.supplier_gstin,
							pi_doc.doctype,
							'-',
							'-' if is_linked else 'Missing in 2B',
							'-']

	return [comma_and("""<a href="#Form/CD GSTR 2B Entry/{0}">{1}</a>""".format(gstr2b_doc.name, gstr2b_doc.name)) if gstr2b_doc else '',
			comma_and("""<a href="#Form/Purchase Invoice/{0}">{1}</a>""".format(pi_doc.name, pi_doc.name)) if pi_doc else '',
			 tax_details, main_details, other_details]

@frappe.whitelist()
def get_link_view_details(gstr2b, pr_list):
	if isinstance(pr_list, string_types):
		pr_list = json.loads(pr_list)
	tax_details = {}
	other_details = {}
	main_details = {}
	pr_details = {}
	gstr2b_doc = frappe.get_doc('CD GSTR 2B Entry', gstr2b)
	tax_details['GSTR-2B'] = [gstr2b_doc.cf_taxable_amount,
						gstr2b_doc.cf_tax_amount,
						gstr2b_doc.cf_igst_amount,
						gstr2b_doc.cf_cgst_amount,
						gstr2b_doc.cf_sgst_amount,
						gstr2b_doc.cf_cess_amount]
	
	other_details['GSTR-2B'] = [
						gstr2b_doc.cf_document_number,
						gstr2b_doc.cf_document_date,
						gstr2b_doc.cf_place_of_supply,
						gstr2b_doc.cf_reverse_charge,
						gstr2b_doc.cf_return_period]

	main_details['GSTR-2B'] = [
						gstr2b_doc.cf_party,
						gstr2b_doc.cf_party_gstin,
						gstr2b_doc.cf_transaction_type,
						gstr2b_doc.cf_match_status,
						gstr2b_doc.cf_status]
	for pr in pr_list:
		pr_doc = frappe.get_doc('Purchase Invoice', pr)
		tax_wise_details = get_tax_details(pr)

		pr_details[pr] = [frappe.bold(comma_and("""<a href="#Form/Purchase Invoice/{0}">{1}</a>""".format(pr, pr))), pr_doc.bill_no, pr_doc.bill_date,
						tax_wise_details['total_tax_amount'], pr_doc.total]

	return [comma_and("""<a href="#Form/CD GSTR 2B Entry/{0}">{1}</a>""".format(gstr2b_doc.name, gstr2b_doc.name)),
			 tax_details, main_details, other_details, pr_details]

@frappe.whitelist()
def update_status(data, status):
	if isinstance(data, string_types):
		data = json.loads(data)
	forbidden_doc_list = []
	ineligible_doc_list = []
	allow_user = True
	user = frappe.session.user
	is_enabled = frappe.db.get_value('CD GSTR 2B Settings', None, 'enable_account_freezing')
	acc_settings = frappe.db.get_values('Accounts Settings', None, ['acc_frozen_upto', 'frozen_accounts_modifier'])
	if not user in get_users_with_role(acc_settings[0][1]) and user != 'Administrator' and is_enabled:
		allow_user = False
	
	for row in data:
		if row and row['gstr_2b']:
			doc = frappe.get_doc('CD GSTR 2B Entry', row['gstr_2b'])
			if doc.cf_status == 'Accepted' and not allow_user and is_enabled:
				if getdate(doc.cf_document_date) <= getdate(acc_settings[0][0]):
					forbidden_doc_list.append(comma_and("""<a href="#Form/CD GSTR 2B Entry/{0}">{1}</a>""".format(row['gstr_2b'], row['gstr_2b'])))
				else:
					forbidden_doc_list.append(comma_and("""<a href="#Form/CD GSTR 2B Entry/{0}">{1}</a>""".format(row['gstr_2b'], row['gstr_2b'])))
				continue
			if doc.cf_status == 'Pending' and not allow_user and is_enabled:
				if getdate(doc.cf_document_date) <= getdate(acc_settings[0][0]):
					forbidden_doc_list.append(comma_and("""<a href="#Form/CD GSTR 2B Entry/{0}">{1}</a>""".format(row['gstr_2b'], row['gstr_2b'])))
					continue
			if status == 'Accepted' and doc.cf_purchase_invoice and \
			round(abs(doc.cf_tax_amount - get_tax_details(doc.cf_purchase_invoice)['total_tax_amount']), 2) > 10:
				ineligible_doc_list.append(comma_and("""<a href="#Form/CD GSTR 2B Entry/{0}">{1}</a>""".format(row['gstr_2b'], row['gstr_2b'])))
				continue

			doc.cf_status = status
			doc.save(ignore_permissions = True)
			doc.reload()
			frappe.db.commit()
	if forbidden_doc_list:
		forbidden_docs = ','.join(forbidden_doc_list)
		frappe.throw(_(f"You are not authorized to update entries {forbidden_docs}"))
	if ineligible_doc_list:
		ineligible_docs = ','.join(ineligible_doc_list)
		frappe.throw(_(f"Tax difference exceeded Rs.10. Unable to accept these documents {ineligible_docs}."))

@frappe.whitelist()
def get_unlinked_pr_list(doctype, txt, searchfield, start, page_len, filters):
	doc = frappe.get_doc('CD GSTR 2B Entry', filters['gstr2b'])	
	pr_list = get_pr_list(doc.cf_company_gstin, filters['from_date'], filters['to_date'], supplier_gstin = doc.cf_party_gstin)
	pr_list = [[entry['name']] for entry in pr_list if entry]
	return pr_list

@frappe.whitelist()
def get_suggested_pr_list(gstr2b, from_date, to_date):
	doc = frappe.get_doc('CD GSTR 2B Entry', gstr2b)	
	pr_list = get_pr_list(doc.cf_company_gstin, from_date, to_date, supplier_gstin = doc.cf_party_gstin)
	pr_list = [entry['name'] for entry in pr_list if entry]
	return pr_list

@frappe.whitelist()
def link_pr(gstr2b, pr):
	gstr2b_doc = frappe.get_doc('CD GSTR 2B Entry', gstr2b)
	pr_doc = frappe.get_doc('Purchase Invoice', pr)
	gstr2b_doc_params = {
		'name': gstr2b_doc.name,
		'gstin': gstr2b_doc.cf_party_gstin,
		'document_type': gstr2b_doc.cf_transaction_type,
		'document_date': gstr2b_doc.cf_document_date,
		'document_number': gstr2b_doc.cf_document_number,
		'total_taxable_amount': gstr2b_doc.cf_taxable_amount,
		'total_tax_amount': gstr2b_doc.cf_tax_amount,
		'igst_amount': gstr2b_doc.cf_igst_amount,
		'cgst_amount': gstr2b_doc.cf_cgst_amount,
		'sgst_amount': gstr2b_doc.cf_sgst_amount,
		'cess_amount': gstr2b_doc.cf_cess_amount
	}

	pr_doc_params = {'name': pr_doc.name,
					'gstin': pr_doc.supplier_gstin,
					'document_date': pr_doc.bill_date,
					'document_type': 'Invoice',
					'document_number': pr_doc.bill_no,
					'total_taxable_amount': pr_doc.total}
	
	pr_doc_params.update(get_tax_details(pr))
	res = get_match_status(gstr2b_doc_params, [pr_doc_params])
	if res:
		update_match_status(gstr2b_doc_params, res)
	else:
		frappe.throw(_("2B record data is not matched with the selected PI"))


@frappe.whitelist()
def send_notifications(data,company,supplier):
	d = eval(data)
	for i in d:
		doc = frappe.get_all('CD GSTR 2B Entry',
			{'name':i.get('gstr_2b')},
			['cf_party',
			'cf_document_number',
			'cf_document_date',
			'cf_taxable_amount',
			'cf_tax_rate',
			'cf_tax_amount',
			'cf_total_amount',
			'cf_reason',
			'cf_cess_amount',
			'cf_sgst_amount',
			'cf_igst_amount',
			'cf_cgst_amount',
			'cf_party_gstin'
			])

		for t in doc:
			em1 =[]
			a=frappe.db.get_value("Dynamic Link",{"link_name":t.cf_party},["parent"])
			if a:
				email=frappe.db.get_value('Address',a,["email_id"])
				em1.append(email)
				name= t.cf_party
				document_number = t.cf_document_number
				document_date=formatdate(t.cf_document_date, "dd/mm/yyyy")
				untaxed = t.cf_taxable_amount
				taxrate = t.cf_tax_rate
				gst = t.cf_tax_amount
				gt = t.cf_total_amount
				reason = t.cf_reason
				gstin = t.cf_party_gstin
				msg=	"""
						<div style="margin-left:50px;margin-right:50px;">
						Dear {0},
						<br><br><br>
						We have found some anomalies while reconciling the GSTR 2B information as being filed by you on the GST Portal. Please find the details below along with the reason of mis-match.
						<br><br>
						Your Sales Invoice: {1}
						<br>
						Your Invoice Date: {2}
						<br>
						Un-taxed Amount: {3}
						<br> 
						Tax Rate : {4}
						<br>
						GST Amount: {5}
						<br> 
						Grand Total: {6}
						<br><br>
						Reason of mismatch: {7}
						<br><br>
						Please rectify these changes and revert as soon as possible. Please communicate with the Purchase Department executive or our Accounts Executives for quicker turn around. Please mention your invoice number while communicating.
						<br><br><br>
						Thanks
						<br><br>
						<Footer from Email account>
						</div>

				""".format(name,document_number,document_date,untaxed,taxrate,gst,gt,reason)
				mail = frappe.get_all('Email Account',{'name':'Custom Notifications'},['email_id'])
				
				for i in mail:
					try:
						make(subject = "{0}-{1}-{2}-{3}".format(str(t.cf_reason),str(t.cf_party_gstin),str(t.cf_document_number),str(document_date)),
							content=msg, recipients=email,
							send_email=True, sender=i.email_id)
						
						msg = """Email send successfully"""
						frappe.msgprint(msg)
					except:
						frappe.msgprint("could not send")


@frappe.whitelist()
def set_content(data,company,supplier):
	print('data*****************',data)
	d = eval(data)
	for i in d:
		doc = frappe.get_all('CD GSTR 2B Entry',
			{'name':i.get('gstr_2b')},
			['cf_party',
			'cf_document_number',
			'cf_document_date',
			'cf_taxable_amount',
			'cf_tax_rate',
			'cf_tax_amount',
			'cf_total_amount',
			'cf_reason',
			'cf_party_gstin',
			'cf_cess_amount',
			'cf_sgst_amount',
			'cf_igst_amount',
			'cf_cgst_amount'
			])

		for t in doc:
			em1 =[]
			a=frappe.db.get_value("Dynamic Link",{"link_name":t.cf_party},["parent"])
			if a:
				email=frappe.db.get_value('Address',a,["email_id"])
				em1.append(email)
				name= t.cf_party
				document_number = t.cf_document_number
				# document_date = t.cf_document_date
				document_date=formatdate(t.cf_document_date, "dd/mm/yyyy")
				untaxed = t.cf_taxable_amount
				taxrate = t.cf_tax_rate
				gst = t.cf_tax_amount
				gt = t.cf_total_amount
				reason = t.cf_reason
				gstin = t.cf_party_gstin
				print('yyyyyyyyyyyyyyyyyyyy',t.cf_document_date,document_date)
				# subject = str(t.cf_document_number) +'-' + str(t.cf_document_date)
				subject = "{0}-{1}-{2}-{3}".format(str(t.cf_reason),str(t.cf_party_gstin),str(t.cf_document_number),str(document_date))
				


				print('subject&&&&&&&&&&&&&&&',subject)
				msg=	"""
						<div style="margin-left:50px;margin-right:50px;">
						Dear {0},
						<br><br><br>
						We have found some anomalies while reconciling the GSTR 2B information as being filed by you on the GST Portal. Please find the details below along with the reason of mis-match.
						<br><br>
						Your Sales Invoice: {1}
						<br>
						Your Invoice Date: {2}
						<br>
						Un-taxed Amount: {3}
						<br> 
						Tax Rate : {4}
						<br>
						GST Amount: {5}
						<br> 
						Grand Total: {6}
						<br><br>
						Reason of mismatch: {7}
						<br><br>
						Please rectify these changes and revert as soon as possible. Please communicate with the Purchase Department executive or our Accounts Executives for quicker turn around. Please mention your invoice number while communicating.
						<br><br><br>
						Thanks
						<br><br>
						<Footer from Email account>
						</div>

				""".format(name,document_number,document_date,untaxed,taxrate,gst,gt,reason)

			print("dhjgdhngcn")
			return msg,subject